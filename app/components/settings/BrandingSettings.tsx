import { useState } from "react";
import { X, Image, Video, Upload, Play } from "lucide-react";
import { Button } from "../ui/button";
import { Label } from "../ui/label";
import { Badge } from "../ui/badge";
import { toast } from "../../hooks/use-toast";
import InstructionVideos from "./InstructionVideos";
import MediaMetadataPanel from "./MediaMetadataPanel";
import VideoGuidelines from "./VideoGuidelines";

interface MediaFile {
  url: string;
  name: string;
  size: string;
  format: string;
  lastUpdated: string;
}

const BrandingSettings = () => {
  const [loadingImage, setLoadingImage] = useState<MediaFile | null>(null);
  const [loadingVideo, setLoadingVideo] = useState<MediaFile | null>(null);
  const [isDraggingImage, setIsDraggingImage] = useState(false);
  const [isDraggingVideo, setIsDraggingVideo] = useState(false);

  const handleDrop = (e: React.DragEvent, type: "image" | "video") => {
    e.preventDefault();
    if (type === "image") {
      setIsDraggingImage(false);
    } else {
      setIsDraggingVideo(false);
    }
    
    const file = e.dataTransfer.files[0];
    if (file) {
      handleFileUpload(file, type);
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(2) + " MB";
  };

  const handleFileUpload = (file: File, type: "image" | "video") => {
    if (type === "image" && !file.type.startsWith("image/")) {
      toast({
        title: "Invalid file type",
        description: "Please upload an image file (PNG, JPG, or WebP).",
        variant: "destructive",
      });
      return;
    }
    if (type === "video" && !file.type.startsWith("video/")) {
      toast({
        title: "Invalid file type",
        description: "Please upload a video file (MP4 or WebM).",
        variant: "destructive",
      });
      return;
    }

    const url = URL.createObjectURL(file);
    const mediaFile: MediaFile = {
      url,
      name: file.name,
      size: formatFileSize(file.size),
      format: file.type.split("/")[1].toUpperCase(),
      lastUpdated: new Date().toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      }),
    };

    if (type === "image") {
      setLoadingImage(mediaFile);
    } else {
      setLoadingVideo(mediaFile);
    }

    toast({
      description: "Uploaded successfully",
      duration: 1500,
    });
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>, type: "image" | "video") => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileUpload(file, type);
    }
  };

  const removeFile = (type: "image" | "video") => {
    if (type === "image") {
      setLoadingImage(null);
    } else {
      setLoadingVideo(null);
    }
    toast({
      description: "Removed",
      duration: 1500,
    });
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <p className="text-sm text-muted-foreground">
          Customize what customers see when they tap your NFC tag.
        </p>
      </div>

      {/* Current Loading Animation Section */}
      <section className="space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-base font-medium text-foreground">Current Loading Animation</h3>
            <p className="text-sm text-muted-foreground mt-1">
              This animation displays when customers tap to verify delivery.
            </p>
          </div>
          <Badge variant="outline" className="text-xs shrink-0">
            {loadingVideo ? "Video" : loadingImage ? "Image" : "Not set"}
          </Badge>
        </div>

        {/* Preview with metadata - responsive grid */}
        {(loadingImage || loadingVideo) ? (
          <div className="grid grid-cols-1 lg:grid-cols-[auto,280px] gap-4 bg-card border border-border rounded-sm overflow-hidden">
            {/* Preview area */}
            <div className="relative aspect-[9/16] max-h-[400px] bg-muted flex items-center justify-center">
              {loadingVideo ? (
                <video
                  src={loadingVideo.url}
                  className="w-full h-full object-cover"
                  autoPlay
                  loop
                  muted
                  playsInline
                />
              ) : loadingImage ? (
                <img
                  src={loadingImage.url}
                  alt="Loading screen"
                  className="w-full h-full object-cover"
                />
              ) : null}
              <Button
                variant="ghost"
                size="icon"
                onClick={() => removeFile(loadingVideo ? "video" : "image")}
                className="absolute top-3 right-3 h-8 w-8 bg-background/80 hover:bg-background"
              >
                <X className="h-4 w-4" />
              </Button>
              {/* Play indicator for video */}
              {loadingVideo && (
                <div className="absolute bottom-3 left-3 flex items-center gap-1.5 bg-background/80 px-2 py-1 rounded-sm">
                  <Play className="h-3 w-3 fill-current" />
                  <span className="text-xs font-medium">Playing</span>
                </div>
              )}
            </div>

            {/* Metadata panel */}
            <div className="p-4 border-t lg:border-t-0 lg:border-l border-border">
              <MediaMetadataPanel
                fileName={(loadingVideo || loadingImage)?.name}
                format={(loadingVideo || loadingImage)?.format}
                fileSize={(loadingVideo || loadingImage)?.size}
                duration={loadingVideo ? "3.2 seconds (loops)" : "—"}
                resolution="1920 × 1080"
                lastUpdated={(loadingVideo || loadingImage)?.lastUpdated}
                onPreview={() => toast({ description: "Preview opened" })}
                onDownload={() => toast({ description: "Download started" })}
              />
            </div>
          </div>
        ) : (
          <div className="bg-muted/30 border border-dashed border-border rounded-sm p-8 text-center aspect-[9/16] max-h-[400px] flex flex-col items-center justify-center">
            <div className="w-12 h-12 bg-muted rounded-full flex items-center justify-center mx-auto mb-3">
              <Video className="h-5 w-5 text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground mb-1">No loading animation set</p>
            <p className="text-xs text-muted-foreground">Upload an image or video below</p>
          </div>
        )}
      </section>

      {/* Upload New Animation Section */}
      <section className="space-y-4">
        <div>
          <h3 className="text-base font-medium text-foreground">Upload New Animation</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Replace the current loading animation with a new branded video or image.
          </p>
        </div>

        {/* Upload areas - stacked on mobile, side by side on larger screens */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Image Upload */}
          <label
            className={`flex flex-col items-center justify-center aspect-[9/16] max-h-[320px] border border-dashed rounded-sm cursor-pointer transition-colors p-6 ${
              isDraggingImage
                ? "border-foreground bg-muted/50"
                : "border-border hover:border-foreground/50 hover:bg-muted/20"
            }`}
            onDragOver={(e) => {
              e.preventDefault();
              setIsDraggingImage(true);
            }}
            onDragLeave={() => setIsDraggingImage(false)}
            onDrop={(e) => handleDrop(e, "image")}
          >
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="sr-only"
              onChange={(e) => handleFileSelect(e, "image")}
            />
            <div className="w-10 h-10 bg-muted rounded-full flex items-center justify-center mb-3">
              <Image className="h-5 w-5 text-muted-foreground" />
            </div>
            <p className="text-sm text-foreground font-medium mb-1">Upload Image</p>
            <p className="text-xs text-muted-foreground text-center">
              Drag and drop or <span className="underline">browse</span>
            </p>
            <p className="text-xs text-muted-foreground mt-1">PNG, JPG, WebP</p>
          </label>

          {/* Video Upload */}
          <label
            className={`flex flex-col items-center justify-center aspect-[9/16] max-h-[320px] border border-dashed rounded-sm cursor-pointer transition-colors p-6 ${
              isDraggingVideo
                ? "border-foreground bg-muted/50"
                : "border-border hover:border-foreground/50 hover:bg-muted/20"
            }`}
            onDragOver={(e) => {
              e.preventDefault();
              setIsDraggingVideo(true);
            }}
            onDragLeave={() => setIsDraggingVideo(false)}
            onDrop={(e) => handleDrop(e, "video")}
          >
            <input
              type="file"
              accept="video/mp4,video/webm"
              className="sr-only"
              onChange={(e) => handleFileSelect(e, "video")}
            />
            <div className="w-10 h-10 bg-muted rounded-full flex items-center justify-center mb-3">
              <Video className="h-5 w-5 text-muted-foreground" />
            </div>
            <p className="text-sm text-foreground font-medium mb-1">Upload Video</p>
            <p className="text-xs text-muted-foreground text-center">
              Drag and drop or <span className="underline">browse</span>
            </p>
            <p className="text-xs text-muted-foreground mt-1">MP4, WebM • Replaces image</p>
          </label>
        </div>

        {/* Video Guidelines */}
        <VideoGuidelines />
      </section>

      {/* Instruction Videos Section */}
      <section className="pt-6 border-t border-border">
        <InstructionVideos />
      </section>

      {/* Save */}
      <div className="pt-6 border-t border-border">
        <Button className="w-full sm:w-auto bg-foreground text-background hover:bg-foreground/90">
          Save Changes
        </Button>
      </div>
    </div>
  );
};

export default BrandingSettings;
