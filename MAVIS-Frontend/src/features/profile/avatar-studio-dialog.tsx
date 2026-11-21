"use client";

import { useCallback, useEffect, useRef, useState, type ChangeEvent, type DragEvent, type PointerEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Camera, LoaderCircle, RotateCcw, Trash2, Upload, ZoomIn, ZoomOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { UserAvatar } from "@/components/shared/user-avatar";
import { useLocale } from "@/lib/i18n/locale-context";

const MAX_FILE_BYTES = 2 * 1024 * 1024;
const PREVIEW_SIZE = 240;
const EXPORT_SIZE = 384;
const ACCEPTED_TYPES = ["image/png", "image/jpeg", "image/webp"];

type LoadedImage = {
  element: HTMLImageElement;
  objectUrl: string;
  naturalWidth: number;
  naturalHeight: number;
};

export function AvatarStudioDialog({
  open,
  onOpenChange,
  userName,
  currentAvatarUrl,
  disabled = false,
  onAvatarUpdated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userName: string;
  currentAvatarUrl?: string | null | undefined;
  disabled?: boolean;
  onAvatarUpdated: (nextAvatarUrl: string | null) => void;
}) {
  const { t } = useLocale();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [loaded, setLoaded] = useState<LoadedImage | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const dragOrigin = useRef({ x: 0, y: 0, startX: 0, startY: 0 });
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState("");

  const resetSelection = useCallback(() => {
    setLoaded((prev) => {
      if (prev) URL.revokeObjectURL(prev.objectUrl);
      return null;
    });
    setZoom(1);
    setOffset({ x: 0, y: 0 });
    setError("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

  useEffect(() => {
    if (!open) resetSelection();
  }, [open, resetSelection]);

  const clampOffset = useCallback(
    (img: LoadedImage, nextZoom: number, nextX: number, nextY: number) => {
      const baseScale = Math.max(PREVIEW_SIZE / img.naturalWidth, PREVIEW_SIZE / img.naturalHeight);
      const drawW = img.naturalWidth * baseScale * nextZoom;
      const drawH = img.naturalHeight * baseScale * nextZoom;
      const maxX = Math.max(0, (drawW - PREVIEW_SIZE) / 2);
      const maxY = Math.max(0, (drawH - PREVIEW_SIZE) / 2);
      return {
        x: Math.min(maxX, Math.max(-maxX, nextX)),
        y: Math.min(maxY, Math.max(-maxY, nextY)),
      };
    },
    [],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !loaded) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, PREVIEW_SIZE, PREVIEW_SIZE);
    const baseScale = Math.max(
      PREVIEW_SIZE / loaded.naturalWidth,
      PREVIEW_SIZE / loaded.naturalHeight,
    );
    const drawW = loaded.naturalWidth * baseScale * zoom;
    const drawH = loaded.naturalHeight * baseScale * zoom;
    const x = (PREVIEW_SIZE - drawW) / 2 + offset.x;
    const y = (PREVIEW_SIZE - drawH) / 2 + offset.y;

    ctx.save();
    ctx.beginPath();
    ctx.arc(PREVIEW_SIZE / 2, PREVIEW_SIZE / 2, PREVIEW_SIZE / 2, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(loaded.element, x, y, drawW, drawH);
    ctx.restore();
  }, [loaded, zoom, offset]);

  const loadFile = (file: File | null | undefined) => {
    if (!file) return;
    setError("");
    if (!ACCEPTED_TYPES.includes(file.type)) {
      setError(
        t(
          "Please choose a PNG, JPEG, or WebP image.",
          "Vui lòng chọn ảnh định dạng PNG, JPEG hoặc WebP.",
        ),
      );
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setError(
        t(
          "Image is larger than 2 MB. Please choose a smaller photo.",
          "Ảnh vượt quá 2 MB. Vui lòng chọn ảnh dung lượng nhỏ hơn.",
        ),
      );
      return;
    }
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      setLoaded((prev) => {
        if (prev) URL.revokeObjectURL(prev.objectUrl);
        return {
          element: img,
          objectUrl,
          naturalWidth: img.naturalWidth,
          naturalHeight: img.naturalHeight,
        };
      });
      setZoom(1);
      setOffset({ x: 0, y: 0 });
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      setError(t("Could not decode the selected image.", "Không thể đọc tệp ảnh đã chọn."));
    };
    img.src = objectUrl;
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    loadFile(event.target.files?.[0]);
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragOver(false);
    loadFile(event.dataTransfer.files?.[0]);
  };

  const handlePointerDown = (event: PointerEvent<HTMLCanvasElement>) => {
    if (!loaded) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(true);
    dragOrigin.current = {
      x: event.clientX,
      y: event.clientY,
      startX: offset.x,
      startY: offset.y,
    };
  };

  const handlePointerMove = (event: PointerEvent<HTMLCanvasElement>) => {
    if (!dragging || !loaded) return;
    const dx = event.clientX - dragOrigin.current.x;
    const dy = event.clientY - dragOrigin.current.y;
    setOffset(clampOffset(loaded, zoom, dragOrigin.current.startX + dx, dragOrigin.current.startY + dy));
  };

  const handlePointerUp = (event: PointerEvent<HTMLCanvasElement>) => {
    if (!dragging) return;
    event.currentTarget.releasePointerCapture(event.pointerId);
    setDragging(false);
  };

  const renderCroppedBlob = async (img: LoadedImage): Promise<{ blob: Blob; filename: string }> => {
    const out = document.createElement("canvas");
    out.width = EXPORT_SIZE;
    out.height = EXPORT_SIZE;
    const ctx = out.getContext("2d");
    if (!ctx) throw new Error("Canvas unavailable");

    const ratio = EXPORT_SIZE / PREVIEW_SIZE;
    const baseScale = Math.max(EXPORT_SIZE / img.naturalWidth, EXPORT_SIZE / img.naturalHeight);
    const drawW = img.naturalWidth * baseScale * zoom;
    const drawH = img.naturalHeight * baseScale * zoom;
    const x = (EXPORT_SIZE - drawW) / 2 + offset.x * ratio;
    const y = (EXPORT_SIZE - drawH) / 2 + offset.y * ratio;

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, EXPORT_SIZE, EXPORT_SIZE);
    ctx.drawImage(img.element, x, y, drawW, drawH);

    const toBlob = (mime: string, quality: number) =>
      new Promise<Blob | null>((resolve) => out.toBlob(resolve, mime, quality));

    const webp = await toBlob("image/webp", 0.9);
    if (webp && webp.type === "image/webp" && webp.size <= MAX_FILE_BYTES) {
      return { blob: webp, filename: "avatar.webp" };
    }
    const jpeg = await toBlob("image/jpeg", 0.9);
    if (jpeg && jpeg.size <= MAX_FILE_BYTES) {
      return { blob: jpeg, filename: "avatar.jpg" };
    }
    throw new Error(t("Could not encode cropped image.", "Không thể nén ảnh đại diện."));
  };

  const saveUploadedPhoto = async () => {
    if (!loaded || uploading || removing || disabled) return;
    setUploading(true);
    setError("");
    try {
      const { blob, filename } = await renderCroppedBlob(loaded);
      const formData = new FormData();
      formData.append("file", blob, filename);
      const res = await fetch("/api/backend/auth/me/avatar", {
        method: "POST",
        body: formData,
      });
      const payload = (await res.json().catch(() => ({}))) as {
        message?: string;
        data?: { avatarUrl?: string | null };
      };
      if (!res.ok) {
        throw new Error(
          payload.message ||
            t("Failed to upload profile photo.", "Không thể tải ảnh đại diện lên máy chủ."),
        );
      }
      const nextUrl = payload.data?.avatarUrl ?? null;
      await queryClient.invalidateQueries({ queryKey: ["api", "session"] });
      await queryClient.invalidateQueries({ queryKey: ["api", "workspaces"] });
      onAvatarUpdated(nextUrl);
      onOpenChange(false);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : t("Could not upload profile photo.", "Không thể tải ảnh đại diện lên."),
      );
    } finally {
      setUploading(false);
    }
  };

  const removeCurrentPhoto = async () => {
    if (uploading || removing || disabled) return;
    setRemoving(true);
    setError("");
    try {
      const res = await fetch("/api/backend/auth/me/avatar", { method: "DELETE" });
      const payload = (await res.json().catch(() => ({}))) as { message?: string };
      if (!res.ok) {
        throw new Error(
          payload.message || t("Failed to remove profile photo.", "Không thể xóa ảnh đại diện."),
        );
      }
      await queryClient.invalidateQueries({ queryKey: ["api", "session"] });
      await queryClient.invalidateQueries({ queryKey: ["api", "workspaces"] });
      onAvatarUpdated(null);
      onOpenChange(false);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : t("Could not remove profile photo.", "Không thể xóa ảnh đại diện."),
      );
    } finally {
      setRemoving(false);
    }
  };

  const busy = uploading || removing;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!busy) onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Camera className="size-4 text-primary" aria-hidden="true" />
            {t("Update Profile Photo", "Cập nhật ảnh đại diện")}
          </DialogTitle>
          <DialogDescription>
            {t(
              "Upload a square-cropped photo (PNG, JPEG, or WebP up to 2 MB). Your photo appears on your profile, header, and class roster.",
              "Tải lên ảnh chân dung rõ nét (PNG, JPEG hoặc WebP tối đa 2 MB). Ảnh sẽ hiển thị trên hồ sơ, thanh điều hướng và danh sách lớp.",
            )}
          </DialogDescription>
        </DialogHeader>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="sr-only"
          aria-label={t("Choose profile photo file", "Chọn tệp ảnh đại diện")}
          onChange={handleFileChange}
        />

        {loaded ? (
          <div className="space-y-4">
            <div className="flex flex-col items-center gap-2">
              <div className="relative rounded-full p-1 ring-2 ring-primary/30">
                <canvas
                  ref={canvasRef}
                  width={PREVIEW_SIZE}
                  height={PREVIEW_SIZE}
                  onPointerDown={handlePointerDown}
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerUp}
                  onPointerCancel={handlePointerUp}
                  className="size-60 cursor-grab touch-none rounded-full bg-muted active:cursor-grabbing"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                {t("Drag image to reposition · Use slider to zoom", "Kéo ảnh để căn giữa · Dùng thanh trượt để phóng to")}
              </p>
            </div>

            <div className="flex items-center gap-3 rounded-lg border bg-muted/30 px-3 py-2">
              <ZoomOut className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <input
                type="range"
                min={1}
                max={3}
                step={0.05}
                value={zoom}
                aria-label={t("Zoom photo", "Phóng to thu nhỏ ảnh")}
                className="flex-1 accent-primary"
                onChange={(e) => {
                  const nextZoom = Number(e.target.value);
                  setZoom(nextZoom);
                  setOffset((prev) => clampOffset(loaded, nextZoom, prev.x, prev.y));
                }}
              />
              <ZoomIn className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <span className="mavis-tabular w-10 text-right text-xs font-medium text-muted-foreground">
                {zoom.toFixed(1)}×
              </span>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={busy}
                onClick={() => {
                  setZoom(1);
                  setOffset({ x: 0, y: 0 });
                }}
              >
                <RotateCcw className="mr-1.5 size-3.5" aria-hidden="true" />
                {t("Center", "Căn giữa")}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="mr-1.5 size-3.5" aria-hidden="true" />
                {t("Choose another photo", "Chọn ảnh khác")}
              </Button>
            </div>
          </div>
        ) : (
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            className={`flex flex-col items-center gap-4 rounded-xl border-2 border-dashed p-6 text-center transition-colors ${
              dragOver
                ? "border-primary bg-primary/5"
                : "border-border/80 bg-muted/20 hover:border-primary/50"
            }`}
          >
            <UserAvatar name={userName} avatarUrl={currentAvatarUrl} size="xl" />
            <div className="space-y-1">
              <p className="text-sm font-medium text-foreground">
                {t("Drag & drop your photo here", "Kéo thả ảnh đại diện vào đây")}
              </p>
              <p className="text-xs text-muted-foreground">
                {t("PNG, JPG, or WebP · Maximum 2 MB", "Định dạng PNG, JPG hoặc WebP · Tối đa 2 MB")}
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              disabled={busy || disabled}
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="mr-1.5 size-4" aria-hidden="true" />
              {t("Browse from device", "Chọn ảnh từ máy tính")}
            </Button>
          </div>
        )}

        {error && (
          <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {error}
          </p>
        )}

        <DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:justify-between">
          <div>
            {currentAvatarUrl && !loaded && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                disabled={busy || disabled}
                onClick={() => void removeCurrentPhoto()}
              >
                {removing ? (
                  <LoaderCircle className="mr-1.5 size-3.5 animate-spin" aria-hidden="true" />
                ) : (
                  <Trash2 className="mr-1.5 size-3.5" aria-hidden="true" />
                )}
                {t("Remove photo", "Xóa ảnh hiện tại")}
              </Button>
            )}
          </div>
          <div className="flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => onOpenChange(false)}
            >
              {t("Cancel", "Hủy")}
            </Button>
            {loaded && (
              <Button type="button" disabled={busy || disabled} onClick={() => void saveUploadedPhoto()}>
                {uploading && <LoaderCircle className="mr-1.5 size-4 animate-spin" aria-hidden="true" />}
                {uploading ? t("Uploading…", "Đang tải lên…") : t("Save photo", "Lưu ảnh đại diện")}
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
