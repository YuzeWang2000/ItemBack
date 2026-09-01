# macOS 本地系统抠图设计

## 边界与兼容性

物归使用 Apple Vision 的 `VNGenerateForegroundInstanceMaskRequest` 生成前景蒙版，再由
Core Image 合成为透明 PNG。最低运行版本为 macOS 14；不支持的平台明确返回
`BACKGROUND_REMOVAL_UNAVAILABLE`，不会上传到云端或静默切换其他算法。

Swift 助手只接收图片字节并返回 PNG 字节，不接收输入/输出路径，因此不能借此读取或写入
附件目录中的任意文件。原生运行 NestJS 时使用 stdio 子进程；生产 API 位于 Linux Docker
容器时，助手作为 Mac 宿主机 loopback 服务运行，使用独立共享密钥鉴权。图片只在本机进程
间传递。

## 状态与附件关系

`BackgroundRemovalJob` 保存 `QUEUED / PROCESSING / SUCCEEDED / FAILED / UNAVAILABLE` 状态。
任务关联一张原始附件和至多一张结果附件，结果以新的 `PHOTO` 附件保存，永不覆盖原图。
`source checksum + algorithmVersion` 唯一，重复请求复用成功结果，失败或不可用任务可以重试。

API 接收请求后立即返回任务记录。进程内队列严格串行执行；启动时会恢复未完成任务，避免
请求线程等待 Vision 推理。网页轮询任务状态，成功后展示新附件；用户仍需主动将结果设为
封面。

## 安全与失败清理

- 仅允许现有、未归档物品名下的 JPEG/PNG/GIF/WebP/AVIF 图片，源文件仍受现有大小上限约束。
- Swift 返回值必须能被 ImageIO 解码且带 alpha 通道，并受独立输出大小上限约束。
- 输出先写入私有 `FileStorage`，再在事务中创建结果附件并完成任务；事务失败会删除新文件。
- 删除原图时关联任务级联删除；删除结果图时任务的 `resultAttachmentId` 自动置空。
- 错误信息只保存稳定的错误码和安全描述，不记录文件路径、密钥或子进程输出细节。
