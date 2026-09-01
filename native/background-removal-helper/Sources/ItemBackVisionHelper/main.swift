import CoreImage
import CoreML
import Foundation
import ImageIO
import Network
import UniformTypeIdentifiers
import Vision

private let algorithmVersion = "apple-vision-foreground-v1"
private let maxInputBytes = 30 * 1024 * 1024

struct Request: Codable { let imageBase64: String }
struct Response: Codable {
  let ok: Bool
  let imageBase64: String?
  let algorithmVersion: String
  let errorCode: String?
  let message: String?
}

enum HelperError: Error {
  case invalidRequest, inputTooLarge, invalidImage, noForeground, renderFailed, unavailable
}

func errorResponse(_ error: Error) -> Response {
  let code: String
  let message: String
  switch error {
  case HelperError.inputTooLarge: (code, message) = ("INPUT_TOO_LARGE", "输入图片超过本地处理上限")
  case HelperError.invalidImage: (code, message) = ("INVALID_IMAGE", "无法解码输入图片")
  case HelperError.noForeground: (code, message) = ("NO_FOREGROUND", "没有识别到可分离的前景物体")
  case HelperError.unavailable: (code, message) = ("VISION_UNAVAILABLE", "当前 macOS 不支持本地系统抠图")
  case HelperError.invalidRequest: (code, message) = ("INVALID_REQUEST", "请求格式无效")
  default: (code, message) = ("PROCESSING_FAILED", "本地系统抠图失败")
  }
  return Response(ok: false, imageBase64: nil, algorithmVersion: algorithmVersion, errorCode: code, message: message)
}

@available(macOS 14.0, *)
func foregroundObservation(_ input: CIImage, cpuOnly: Bool) throws -> (VNInstanceMaskObservation, VNImageRequestHandler) {
  let request = VNGenerateForegroundInstanceMaskRequest()
  if cpuOnly {
    for (stage, devices) in try request.supportedComputeStageDevices {
      if let cpu = devices.first(where: { device in
        if case .cpu = device { return true }
        return false
      }) {
        request.setComputeDevice(cpu, for: stage)
      }
    }
  }
  let handler = VNImageRequestHandler(ciImage: input)
  try handler.perform([request])
  guard let observation = request.results?.first, !observation.allInstances.isEmpty else {
    throw HelperError.noForeground
  }
  return (observation, handler)
}

@available(macOS 14.0, *)
func removeBackground(_ data: Data) throws -> Data {
  guard data.count <= maxInputBytes else { throw HelperError.inputTooLarge }
  guard let input = CIImage(data: data, options: [.applyOrientationProperty: true]) else {
    throw HelperError.invalidImage
  }
  let observation: VNInstanceMaskObservation
  let handler: VNImageRequestHandler
  do {
    (observation, handler) = try foregroundObservation(input, cpuOnly: false)
  } catch {
    // Some macOS / Apple Neural Engine combinations temporarily fail to load Vision's bundled
    // model. CPU inference remains entirely local and keeps the feature available.
    (observation, handler) = try foregroundObservation(input, cpuOnly: true)
  }
  let maskBuffer = try observation.generateScaledMaskForImage(
    forInstances: observation.allInstances,
    from: handler
  )
  let mask = CIImage(cvPixelBuffer: maskBuffer)
  let clear = CIImage(color: .clear).cropped(to: input.extent)
  guard let filter = CIFilter(name: "CIBlendWithMask") else { throw HelperError.renderFailed }
  filter.setValue(input, forKey: kCIInputImageKey)
  filter.setValue(clear, forKey: kCIInputBackgroundImageKey)
  filter.setValue(mask, forKey: kCIInputMaskImageKey)
  guard let output = filter.outputImage?.cropped(to: input.extent) else {
    throw HelperError.renderFailed
  }
  let context = CIContext(options: [.useSoftwareRenderer: false])
  guard let colorSpace = CGColorSpace(name: CGColorSpace.sRGB),
        let png = context.pngRepresentation(
          of: output,
          format: .RGBA8,
          colorSpace: colorSpace,
          options: [:]
        ) else { throw HelperError.renderFailed }
  return png
}

func handle(_ body: Data) -> Data {
  let response: Response
  do {
    guard #available(macOS 14.0, *) else { throw HelperError.unavailable }
    let request: Request
    do { request = try JSONDecoder().decode(Request.self, from: body) }
    catch { throw HelperError.invalidRequest }
    guard let input = Data(base64Encoded: request.imageBase64) else { throw HelperError.invalidRequest }
    let output = try removeBackground(input)
    response = Response(
      ok: true,
      imageBase64: output.base64EncodedString(),
      algorithmVersion: algorithmVersion,
      errorCode: nil,
      message: nil
    )
  } catch {
    if ProcessInfo.processInfo.environment["ITEMBACK_VISION_DEBUG"] == "1" {
      fputs("Vision helper debug: \(String(describing: error))\n", stderr)
    }
    response = errorResponse(error)
  }
  return (try? JSONEncoder().encode(response)) ?? Data()
}

func runStdio() {
  let body = FileHandle.standardInput.readDataToEndOfFile()
  FileHandle.standardOutput.write(handle(body))
}

final class HttpServer {
  private let listener: NWListener
  private let token: String

  init(port: UInt16, token: String) throws {
    self.token = token
    let parameters = NWParameters.tcp
    parameters.requiredLocalEndpoint = .hostPort(
      host: .ipv4(IPv4Address.loopback),
      port: NWEndpoint.Port(rawValue: port)!
    )
    listener = try NWListener(using: parameters)
  }

  func run() {
    listener.newConnectionHandler = { [weak self] connection in self?.accept(connection) }
    listener.start(queue: .global(qos: .userInitiated))
    print("ItemBack Vision helper listening on 127.0.0.1:\(listener.port?.rawValue ?? 0)")
    dispatchMain()
  }

  private func accept(_ connection: NWConnection) {
    connection.start(queue: .global(qos: .userInitiated))
    receive(connection, accumulated: Data())
  }

  private func receive(_ connection: NWConnection, accumulated: Data) {
    connection.receive(minimumIncompleteLength: 1, maximumLength: 65_536) { [weak self] data, _, complete, error in
      guard let self else { return }
      var buffer = accumulated
      if let data { buffer.append(data) }
      if let parsed = self.parseRequest(buffer) {
        self.respond(connection, parsed: parsed)
      } else if complete || error != nil || buffer.count > 45 * 1024 * 1024 {
        self.respond(connection, status: "400 Bad Request", body: self.encode(errorResponse(HelperError.invalidRequest)))
      } else {
        self.receive(connection, accumulated: buffer)
      }
    }
  }

  private func parseRequest(_ data: Data) -> (authorized: Bool, body: Data)? {
    guard let marker = "\r\n\r\n".data(using: .utf8),
          let range = data.range(of: marker),
          let headers = String(data: data[..<range.lowerBound], encoding: .utf8) else { return nil }
    let lines = headers.components(separatedBy: "\r\n")
    guard lines.first == "POST /remove-background HTTP/1.1" else {
      return (false, Data())
    }
    let length = lines.compactMap { line -> Int? in
      let parts = line.split(separator: ":", maxSplits: 1)
      return parts.count == 2 && parts[0].lowercased() == "content-length"
        ? Int(parts[1].trimmingCharacters(in: .whitespaces)) : nil
    }.first
    guard let length else { return (false, Data()) }
    let start = range.upperBound
    guard data.count >= start + length else { return nil }
    let authorized = lines.contains("Authorization: Bearer \(token)")
    return (authorized, data.subdata(in: start..<(start + length)))
  }

  private func respond(_ connection: NWConnection, parsed: (authorized: Bool, body: Data)) {
    if !parsed.authorized {
      respond(connection, status: "401 Unauthorized", body: encode(errorResponse(HelperError.invalidRequest)))
    } else {
      respond(connection, status: "200 OK", body: handle(parsed.body))
    }
  }

  private func encode(_ value: Response) -> Data { (try? JSONEncoder().encode(value)) ?? Data() }

  private func respond(_ connection: NWConnection, status: String, body: Data) {
    let head = "HTTP/1.1 \(status)\r\nContent-Type: application/json\r\nContent-Length: \(body.count)\r\nConnection: close\r\n\r\n"
    var response = Data(head.utf8)
    response.append(body)
    connection.send(content: response, completion: .contentProcessed { _ in connection.cancel() })
  }
}

let arguments = CommandLine.arguments
if arguments.contains("--serve") {
  let environment = ProcessInfo.processInfo.environment
  guard let token = environment["ITEMBACK_VISION_TOKEN"], token.count >= 32 else {
    fputs("ITEMBACK_VISION_TOKEN must contain at least 32 characters\n", stderr)
    exit(2)
  }
  let port = UInt16(environment["ITEMBACK_VISION_PORT"] ?? "43118") ?? 43118
  do { try HttpServer(port: port, token: token).run() }
  catch { fputs("Unable to start local helper\n", stderr); exit(2) }
} else {
  runStdio()
}
