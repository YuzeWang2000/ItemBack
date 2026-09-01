import type { AttachmentRecord } from '@itemback/contracts';
import { Crop, RotateCcw, RotateCw, X } from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { api, contentUrl } from '../api';
import { Loading, Notice } from './ui';

const aspectOptions = [
  { value: 'original', label: '原始比例' },
  { value: '1:1', label: '方形' },
  { value: '4:3', label: '横向 4:3' },
  { value: '3:4', label: '纵向 3:4' },
] as const;

type AspectOption = (typeof aspectOptions)[number]['value'];

export function ImageEditorDialog({
  itemId,
  file,
  isCover,
  onClose,
  onSaved,
}: {
  itemId: string;
  file: AttachmentRecord;
  isCover: boolean;
  onClose(): void;
  onSaved(attachment: AttachmentRecord): void;
}) {
  const titleId = useId();
  const canvas = useRef<HTMLCanvasElement>(null);
  const [bitmap, setBitmap] = useState<ImageBitmap | null>(null);
  const [loadError, setLoadError] = useState('');
  const [saveError, setSaveError] = useState('');
  const [saving, setSaving] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [aspectOption, setAspectOption] = useState<AspectOption>('original');
  const [zoom, setZoom] = useState(1);
  const [positionX, setPositionX] = useState(0);
  const [positionY, setPositionY] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    let loaded: ImageBitmap | undefined;
    setBitmap(null);
    setLoadError('');
    void (async () => {
      try {
        const response = await fetch(contentUrl(file.id), {
          credentials: 'include',
          signal: controller.signal,
        });
        if (!response.ok) throw new Error('IMAGE_LOAD_FAILED');
        loaded = await createImageBitmap(await response.blob(), { imageOrientation: 'from-image' });
        if (active) setBitmap(loaded);
      } catch (reason) {
        if (active && !(reason instanceof DOMException && reason.name === 'AbortError')) {
          setLoadError('无法读取这张图片，请稍后重试。');
        }
      }
    })();
    return () => {
      active = false;
      controller.abort();
      loaded?.close();
    };
  }, [file.id]);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !saving) onClose();
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [onClose, saving]);

  const rotatedDimensions = useMemo(() => {
    if (!bitmap) return { width: 1, height: 1 };
    return rotation % 180 === 0
      ? { width: bitmap.width, height: bitmap.height }
      : { width: bitmap.height, height: bitmap.width };
  }, [bitmap, rotation]);
  const aspect = useMemo(() => {
    if (aspectOption === '1:1') return 1;
    if (aspectOption === '4:3') return 4 / 3;
    if (aspectOption === '3:4') return 3 / 4;
    return rotatedDimensions.width / rotatedDimensions.height;
  }, [aspectOption, rotatedDimensions]);

  useEffect(() => {
    if (!bitmap || !canvas.current) return;
    const size = previewSize(aspect);
    canvas.current.width = size.width;
    canvas.current.height = size.height;
    drawCrop(canvas.current, bitmap, rotation, zoom, positionX, positionY);
  }, [aspect, bitmap, positionX, positionY, rotation, zoom]);

  const resetPosition = () => {
    setZoom(1);
    setPositionX(0);
    setPositionY(0);
  };
  const rotate = (direction: -1 | 1) => {
    setRotation((current) => (current + direction * 90 + 360) % 360);
    resetPosition();
  };
  const selectAspect = (value: AspectOption) => {
    setAspectOption(value);
    resetPosition();
  };
  const save = async () => {
    if (!bitmap) return;
    setSaveError('');
    setSaving(true);
    try {
      const output = outputSize(rotatedDimensions.width, rotatedDimensions.height, aspect, zoom);
      const result = document.createElement('canvas');
      result.width = output.width;
      result.height = output.height;
      drawCrop(result, bitmap, rotation, zoom, positionX, positionY);
      const blob = await new Promise<Blob>((resolve, reject) =>
        result.toBlob(
          (created) => (created ? resolve(created) : reject(new Error('IMAGE_EXPORT_FAILED'))),
          'image/png',
        ),
      );
      const basename = file.originalFilename.replace(/\.[^.]+$/, '').slice(0, 480);
      const edited = new File([blob], `${basename || '图片'}-已编辑.png`, { type: 'image/png' });
      const body = new FormData();
      body.append('files', edited);
      body.append('category', 'PHOTO');
      const created = await api<AttachmentRecord[]>(`/items/${itemId}/attachments`, {
        method: 'POST',
        body,
      });
      const attachment = created[0];
      if (!attachment) throw new Error('IMAGE_UPLOAD_FAILED');
      if (isCover) {
        await api(`/items/${itemId}/cover/${attachment.id}`, { method: 'PATCH' });
      }
      onSaved(attachment);
    } catch {
      setSaveError('图片保存失败，原图没有受到影响，请稍后重试。');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop" onMouseDown={() => !saving && onClose()}>
      <section
        className="modal image-editor-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button
          className="icon-button modal-close"
          onClick={onClose}
          disabled={saving}
          aria-label="关闭图片编辑"
        >
          <X />
        </button>
        <p className="eyebrow">图片编辑</p>
        <h2 id={titleId}>旋转与裁剪</h2>
        <p>调整画面后保存为新图片，原图会继续保留。</p>
        {loadError ? (
          <Notice>{loadError}</Notice>
        ) : !bitmap ? (
          <Loading label="正在准备图片…" />
        ) : (
          <>
            <div className="image-editor-stage">
              <canvas ref={canvas} aria-label="裁剪结果预览" />
              <span>
                <Crop size={14} /> 保存区域
              </span>
            </div>
            <div className="image-editor-toolbar" aria-label="图片方向">
              <button className="button secondary" type="button" onClick={() => rotate(-1)}>
                <RotateCcw size={16} /> 向左旋转
              </button>
              <button className="button secondary" type="button" onClick={() => rotate(1)}>
                <RotateCw size={16} /> 向右旋转
              </button>
            </div>
            <div className="image-editor-aspects" role="group" aria-label="裁剪比例">
              {aspectOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={aspectOption === option.value ? 'selected' : ''}
                  aria-pressed={aspectOption === option.value}
                  onClick={() => selectAspect(option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <div className="image-editor-sliders">
              <label>
                <span>
                  缩放 <output>{Math.round(zoom * 100)}%</output>
                </span>
                <input
                  type="range"
                  min="1"
                  max="3"
                  step="0.01"
                  value={zoom}
                  onChange={(event) => setZoom(Number(event.target.value))}
                />
              </label>
              <label>
                <span>水平位置</span>
                <input
                  type="range"
                  min="-100"
                  max="100"
                  value={positionX}
                  onChange={(event) => setPositionX(Number(event.target.value))}
                />
              </label>
              <label>
                <span>垂直位置</span>
                <input
                  type="range"
                  min="-100"
                  max="100"
                  value={positionY}
                  onChange={(event) => setPositionY(Number(event.target.value))}
                />
              </label>
            </div>
            {saveError && <Notice>{saveError}</Notice>}
            <div className="form-actions">
              <button className="button ghost" type="button" onClick={onClose} disabled={saving}>
                取消
              </button>
              <button className="button primary" type="button" onClick={save} disabled={saving}>
                {saving ? '正在保存…' : '保存新图片'}
              </button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}

function previewSize(aspect: number) {
  return aspect >= 1
    ? { width: 720, height: Math.max(1, Math.round(720 / aspect)) }
    : { width: Math.max(1, Math.round(720 * aspect)), height: 720 };
}

function outputSize(width: number, height: number, aspect: number, zoom: number) {
  let cropWidth: number;
  let cropHeight: number;
  if (width / height > aspect) {
    cropHeight = height / zoom;
    cropWidth = cropHeight * aspect;
  } else {
    cropWidth = width / zoom;
    cropHeight = cropWidth / aspect;
  }
  const scale = Math.min(1, 2400 / Math.max(cropWidth, cropHeight));
  return {
    width: Math.max(1, Math.round(cropWidth * scale)),
    height: Math.max(1, Math.round(cropHeight * scale)),
  };
}

function drawCrop(
  canvas: HTMLCanvasElement,
  bitmap: ImageBitmap,
  rotation: number,
  zoom: number,
  positionX: number,
  positionY: number,
) {
  const context = canvas.getContext('2d');
  if (!context) return;
  const radians = (rotation * Math.PI) / 180;
  const quarterTurn = rotation % 180 !== 0;
  const rotatedWidth = quarterTurn ? bitmap.height : bitmap.width;
  const rotatedHeight = quarterTurn ? bitmap.width : bitmap.height;
  const baseScale = Math.max(canvas.width / rotatedWidth, canvas.height / rotatedHeight);
  const scale = baseScale * zoom;
  const horizontalRoom = Math.max(0, (rotatedWidth * scale - canvas.width) / 2);
  const verticalRoom = Math.max(0, (rotatedHeight * scale - canvas.height) / 2);

  context.clearRect(0, 0, canvas.width, canvas.height);
  context.save();
  context.translate(
    canvas.width / 2 + (positionX / 100) * horizontalRoom,
    canvas.height / 2 + (positionY / 100) * verticalRoom,
  );
  context.rotate(radians);
  context.drawImage(
    bitmap,
    (-bitmap.width * scale) / 2,
    (-bitmap.height * scale) / 2,
    bitmap.width * scale,
    bitmap.height * scale,
  );
  context.restore();
}
