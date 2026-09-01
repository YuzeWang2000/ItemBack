// swift-tools-version: 5.9
import PackageDescription

let package = Package(
  name: "ItemBackVisionHelper",
  platforms: [.macOS(.v14)],
  products: [.executable(name: "itemback-vision-helper", targets: ["ItemBackVisionHelper"])],
  targets: [.executableTarget(name: "ItemBackVisionHelper")]
)
