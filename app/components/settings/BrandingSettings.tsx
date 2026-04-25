import { useState, useRef, useEffect } from "react";
import { useFetcher } from "react-router";
import {
  Plus,
  Play,
  Trash2,
  GripVertical,
  ChevronDown,
  Pause,
} from "lucide-react";
import { Layout } from "@shopify/polaris";
import { Button } from "../ui/button";
import { Label } from "../ui/label";
import { Switch } from "../ui/switch";
import { Slider } from "../ui/slider";
import { Badge } from "../ui/badge";
import { toast } from "../../hooks/use-toast";

interface MediaItem {
  id: string;
  url: string;
  name: string;
  type: "image" | "video";
  duration?: string;            // display string e.g. "5s"
  durationSeconds?: number;     // numeric — used by ConsumerTap to cap playback
  loop?: boolean;
  isPrimary?: boolean;
  isActive?: boolean;
  size?: string;
  dimensions?: string;
  uploadDate?: string;
  merchantSlug?: string;
  isMock?: boolean;
}

const MediaRow = ({
  item,
  index,
  isExpanded,
  onToggle,
  onDelete,
  onSetPrimary,
  isPrimary,
  dragHandlers,
  dragState,
  loopVideo,
  onLoopChange,
  duration,
  onDurationChange,
  onDurationCommit,
}: {
  item: MediaItem;
  index: number;
  isExpanded: boolean;
  onToggle: () => void;
  onDelete: () => void;
  onSetPrimary: () => void;
  isPrimary: boolean;
  dragHandlers: {
    onDragStart: (e: React.DragEvent) => void;
    onDragOver: (e: React.DragEvent) => void;
    onDrop: (e: React.DragEvent) => void;
    onDragEnd: () => void;
  };
  dragState: { isDragging: boolean; isDragOver: boolean };
  loopVideo: boolean;
  onLoopChange: (v: boolean) => void;
  duration: number;
  onDurationChange: (v: number) => void;
  onDurationCommit: () => void;
}) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  const getFileExt = (name: string) =>
    name?.split(".").pop()?.toUpperCase() || "FILE";

  const togglePlay = () => {
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
    } else {
      videoRef.current.play();
    }
    setIsPlaying(!isPlaying);
  };

  return (
    <div
      className={`border-b border-border last:border-b-0 transition-colors ${
        dragState.isDragOver ? "bg-muted/40" : ""
      } ${dragState.isDragging ? "opacity-40" : ""}`}
    >
      {/* Row */}
      <div
        className="group flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-muted/30 transition-colors"
        onClick={onToggle}
      >
        {/* Drag handle */}
        <div
          draggable
          onDragStart={dragHandlers.onDragStart}
          onDragOver={dragHandlers.onDragOver}
          onDrop={dragHandlers.onDrop}
          onDragEnd={dragHandlers.onDragEnd}
          onClick={(e) => e.stopPropagation()}
          className="shrink-0 cursor-grab active:cursor-grabbing p-0.5 opacity-40 group-hover:opacity-70 transition-opacity"
        >
          <GripVertical className="h-4 w-4 text-muted-foreground" />
        </div>

        {/* Thumbnail */}
        <div className="relative w-[27px] h-[48px] bg-muted rounded-sm overflow-hidden shrink-0">
          {item.isMock && item.type === "video" ? (
            <div
              className="w-full h-full"
              style={{
                background:
                  "linear-gradient(160deg, hsl(0 0% 30%) 0%, hsl(0 0% 5%) 100%)",
              }}
            />
          ) : item.isMock && item.type === "image" ? (
            <div className="w-full h-full bg-muted flex items-center justify-center">
              <span className="text-[6px] font-bold text-foreground/20">
                ink.
              </span>
            </div>
          ) : item.type === "video" || item.url?.match(/\.(mp4|webm|ogg)$/i) ? (
            <video
              src={item.url}
              className="w-full h-full object-cover"
              muted
              playsInline
            />
          ) : (
            <img
              src={item.url}
              alt={item.name}
              className="w-full h-full object-cover"
            />
          )}
          {(item.type === "video" || item.url?.match(/\.(mp4|webm|ogg)$/i)) && (
            <div className="absolute inset-0 flex items-center justify-center">
              <Play className="h-2.5 w-2.5 fill-background text-background drop-shadow" />
            </div>
          )}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0 flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="text-sm text-foreground truncate">{item.name}</p>
              {isPrimary && (
                <Badge
                  variant="secondary"
                  className="text-[10px] px-1.5 py-0 h-4 shrink-0"
                >
                  Primary
                </Badge>
              )}
            </div>
          </div>
          <span className="text-xs text-muted-foreground shrink-0 hidden sm:block">
            {getFileExt(item.name)}
          </span>
          {item.size && (
            <span className="text-xs text-muted-foreground shrink-0 hidden sm:block">
              {item.size}
            </span>
          )}
          {item.type === "video" && item.duration ? (
            <span className="text-xs text-muted-foreground shrink-0">
              {item.duration}
            </span>
          ) : (
            <span className="text-xs text-muted-foreground shrink-0 hidden sm:block">
              —
            </span>
          )}
        </div>

        {/* Delete */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="shrink-0 p-1 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
          aria-label="Delete"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>

        {/* Chevron */}
        <div
          className="shrink-0 transition-transform duration-300 ease-out"
          style={{ transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)" }}
        >
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        </div>
      </div>

      {/* Expanded panel */}
      <div
        className="overflow-hidden transition-all duration-300 ease-out"
        style={{
          maxHeight: isExpanded ? "600px" : "0px",
          opacity: isExpanded ? 1 : 0,
        }}
      >
        <div className="px-4 pb-4 pt-1 border-t border-border bg-muted/10">
          {/* Preview */}
          <div className="flex justify-center py-4">
            {item.type === "video" || item.url?.match(/\.(mp4|webm|ogg)$/i) ? (
              <div className="relative w-[180px] aspect-[9/16] bg-background rounded-sm overflow-hidden border border-border">
                {item.isMock ? (
                  <div
                    className="w-full h-full"
                    style={{
                      background:
                        "linear-gradient(160deg, hsl(0 0% 30%) 0%, hsl(0 0% 5%) 100%)",
                    }}
                  >
                    <div className="absolute inset-0 flex items-center justify-center">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                        }}
                        className="w-10 h-10 rounded-full bg-background/20 flex items-center justify-center backdrop-blur-sm"
                      >
                        <Play className="h-5 w-5 fill-background text-background ml-0.5" />
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <video
                      ref={videoRef}
                      src={item.url}
                      className="w-full h-full object-cover"
                      muted
                      playsInline
                      loop
                      onEnded={() => setIsPlaying(false)}
                    />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          togglePlay();
                        }}
                        className="w-10 h-10 rounded-full bg-background/20 flex items-center justify-center backdrop-blur-sm transition-opacity hover:bg-background/30"
                      >
                        {isPlaying ? (
                          <Pause className="h-5 w-5 fill-background text-background" />
                        ) : (
                          <Play className="h-5 w-5 fill-background text-background ml-0.5" />
                        )}
                      </button>
                    </div>
                  </>
                )}
              </div>
            ) : (
              <div className="max-h-[400px] overflow-hidden rounded-sm border border-border">
                {item.isMock ? (
                  <div className="w-[180px] aspect-[9/16] bg-muted flex items-center justify-center">
                    <span className="text-3xl font-bold text-foreground/20">
                      ink.
                    </span>
                  </div>
                ) : (
                  <img
                    src={item.url}
                    alt={item.name}
                    className="max-h-[400px] w-auto object-contain"
                  />
                )}
              </div>
            )}
          </div>

          {/* Metadata */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs mb-4">
            <div>
              <p className="text-muted-foreground mb-0.5">Filename</p>
              <p className="text-foreground truncate">{item.name}</p>
            </div>
            {item.dimensions && (
              <div>
                <p className="text-muted-foreground mb-0.5">Dimensions</p>
                <p className="text-foreground">{item.dimensions}</p>
              </div>
            )}
            {item.size && (
              <div>
                <p className="text-muted-foreground mb-0.5">File Size</p>
                <p className="text-foreground">{item.size}</p>
              </div>
            )}
            {item.type === "video" && item.duration && (
              <div>
                <p className="text-muted-foreground mb-0.5">Duration</p>
                <p className="text-foreground">{item.duration}</p>
              </div>
            )}
            {item.uploadDate && (
              <div>
                <p className="text-muted-foreground mb-0.5">Uploaded</p>
                <p className="text-foreground">{item.uploadDate}</p>
              </div>
            )}
          </div>

          {/* Video Controls */}
          {item.type === "video" && (
            <div className="space-y-4 pt-4 border-t border-border">
              <div className="flex items-center justify-between">
                <Label
                  htmlFor={`loop-${item.id}`}
                  className="text-xs font-medium text-foreground"
                >
                  Loop playback
                </Label>
                <Switch
                  id={`loop-${item.id}`}
                  checked={loopVideo}
                  onCheckedChange={onLoopChange}
                />
              </div>
              <div
                className={`transition-opacity ${
                  !loopVideo ? "opacity-50 pointer-events-none" : ""
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <Label className="text-xs font-medium text-foreground">
                    Duration
                  </Label>
                  <span className="text-xs font-medium tabular-nums bg-muted px-1.5 py-0.5 rounded">
                    {duration}s
                  </span>
                </div>
                <Slider
                  value={[duration]}
                  onValueChange={(v) => onDurationChange(v[0])}
                  onValueCommit={onDurationCommit}
                  min={3}
                  max={15}
                  step={1}
                  className="w-full mb-4"
                  disabled={!loopVideo}
                />
              </div>
            </div>
          )}

          {/* Set as Primary */}
          {!isPrimary && (
            <div className="pt-4 border-t border-border">
              <Button
                variant="outline"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  onSetPrimary();
                }}
                className="text-xs"
              >
                Set as Primary
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const BrandingSettings = () => {
  const [items, setItems] = useState<MediaItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [loopVideo, setLoopVideo] = useState(true);
  const [duration, setDuration] = useState(5);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [guidelinesOpen, setGuidelinesOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Helper to fetch securely passing App Bridge token
  const fetchSecure = async (path: string, options: RequestInit = {}) => {
    // Determine the host dynamically from the URL or default to current origin
    const appUrl = window.location.origin;
    
    let token = "";
    try {
      // @ts-ignore
      token = await window.shopify?.idToken();
    } catch(e) {
      console.warn("Could not retrieve Shopify session token", e);
    }
    
    // For standalone testing, fallback to generic JWT
    if (!token && localStorage.getItem('token')) {
       token = localStorage.getItem('token') || '';
    }

    const headers = new Headers(options.headers);
    if (token) {
        headers.set('Authorization', `Bearer ${token}`);
    }

    const response = await fetch(`${appUrl}${path}`, {
      ...options,
      headers
    });
    
    // Check if response is JSON
    const contentType = response.headers.get("content-type");
    if (!response.ok) {
       let errMessage = `Error: ${response.status}`;
       if (contentType && contentType.includes("application/json")) {
           const errData = await response.json();
           errMessage = errData.error || errMessage;
       }
       throw new Error(errMessage);
    }
    
    if (contentType && contentType.includes("application/json")) {
       return response.json();
    }
    return null;
  };

  // Load existing items on mount
  useEffect(() => {
    const loadMedia = async () => {
      try {
        const data = await fetchSecure("/app/api/settings/media");
        if (data && Array.isArray(data.media)) {
          setItems(data.media);
        }
      } catch (err: any) {
        console.error("Failed to load media:", err);
      } finally {
        setIsLoading(false);
      }
    };
    loadMedia();
  }, []);

  const handleFileUpload = async (file: File) => {
    const isVideo = file.type.startsWith("video/");
    const isImage = file.type.startsWith("image/");
    if (!isVideo && !isImage) {
      toast({
        title: "Invalid file type",
        description: "Upload an image (PNG, JPG, WebP) or video (MP4, WebM).",
        variant: "destructive",
      });
      return;
    }
    const formData = new FormData();
    formData.append("file", file, file.name);
    formData.append("duration", `${duration}s`);
    
    toast({ description: "Uploading media to storage...", duration: 2500 });
    setIsSubmitting(true);
    try {
       const data = await fetchSecure("/app/api/settings/media", {
         method: "POST",
         // Do not set Content-Type header manually when sending FormData, the browser handles it + boundary
         body: formData
       });
       if (data && data.media) {
          setItems(data.media);
          toast({ description: "Media uploaded successfully", duration: 2000 });
       }
    } catch (err: any) {
       toast({ title: "Failed", description: err.message, variant: "destructive", duration: 3000 });
    } finally {
       setIsSubmitting(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFileUpload(file);
    e.target.value = "";
  };

  const removeItem = async (id: string) => {
    toast({ description: "Removing media...", duration: 2000 });
    setIsSubmitting(true);
    try {
        const data = await fetchSecure("/app/api/settings/media", {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id })
        });
        if (data && data.media) setItems(data.media);
    } catch (err: any) {
         toast({ title: "Failed", description: err.message, variant: "destructive", duration: 3000 });
    } finally {
         setIsSubmitting(false);
    }
  };

  const setAsPrimary = async (id: string) => {
    // Optimistic update: flag the new primary, move to top, render instantly.
    const previous = items;
    const targetIdx = items.findIndex((it) => it.id === id);
    if (targetIdx < 0) return;

    const optimistic = items.map((it) => ({ ...it, isPrimary: it.id === id }));
    const [moved] = optimistic.splice(targetIdx, 1);
    optimistic.unshift(moved);
    setItems(optimistic);

    setIsSubmitting(true);
    try {
        const data = await fetchSecure("/app/api/settings/media", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ setPrimaryId: id })
        });
        if (data && data.media) setItems(data.media);
        toast({ description: "Primary updated", duration: 1500 });
    } catch (err: any) {
         setItems(previous); // revert on failure
         toast({ title: "Failed to set primary", description: err.message, variant: "destructive", duration: 3000 });
    } finally {
         setIsSubmitting(false);
    }
  };

  const makeDragHandlers = (i: number) => ({
    onDragStart: (e: React.DragEvent) => {
      setDragIndex(i);
      e.dataTransfer.effectAllowed = "move";
    },
    onDragOver: (e: React.DragEvent) => {
      e.preventDefault();
      setDragOverIndex(i);
    },
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      if (dragIndex !== null && dragIndex !== i) {
        const updated = [...items];
        const [moved] = updated.splice(dragIndex, 1);
        updated.splice(i, 0, moved);
        setItems(updated); // Optimistic UI local drag
        
        // Sync to server
        const reorderedIds = updated.map(item => item.id);
        fetchSecure("/app/api/settings/media", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ reorderedIds })
        }).catch(err => {
             toast({ title: "Failed", description: err.message, variant: "destructive", duration: 3000 });
        });
      }
      setDragIndex(null);
      setDragOverIndex(null);
    },
    onDragEnd: () => {
      setDragIndex(null);
      setDragOverIndex(null);
    },
  });

  // True when at least one item has the new server-set isPrimary flag.
  // Until that flag is on every legacy item, we keep a "first item is primary"
  // fallback. Once Alan + the migration backfill all items, this can simplify
  // to `const hasExplicitPrimary = true`.
  const hasExplicitPrimary = items.some((it) => it.isPrimary);

  return (
    <Layout>
      <Layout.AnnotatedSection
        title="Loading Media"
        description="Upload the videos and images your customers see when they tap. The 'Primary' video is shown during the consumer tap experience!"
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,video/mp4,video/webm"
          className="sr-only"
          onChange={handleFileSelect}
        />

        {/* Media List */}
        <section className="border border-border rounded-sm">
          {items.map((item, i) => (
            <MediaRow
              key={item.id}
              item={item}
              index={i}
              isExpanded={expandedId === item.id}
              onToggle={() =>
                setExpandedId(expandedId === item.id ? null : item.id)
              }
              onDelete={() => removeItem(item.id)}
              onSetPrimary={() => setAsPrimary(item.id)}
              // Prefer explicit isPrimary flag from server data. Fall back to
              // "first item" only for legacy uploads predating the flag.
              isPrimary={
                hasExplicitPrimary ? !!item.isPrimary : i === 0
              }
              dragHandlers={makeDragHandlers(i)}
              dragState={{
                isDragging: dragIndex === i,
                isDragOver: dragOverIndex === i,
              }}
              loopVideo={loopVideo}
              onLoopChange={(v) => setLoopVideo(v) }
              duration={duration}
              onDurationChange={setDuration}
              onDurationCommit={() => {}}
            />
          ))}

          {/* Add Media row */}
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isSubmitting || isLoading}
            className={`w-full flex items-center gap-3 px-3 py-3 text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors ${isSubmitting || isLoading ? "opacity-50" : ""}`}
          >
            <div className="w-5 shrink-0" />
            <div className="w-[27px] h-[48px] border border-dashed border-border rounded-sm flex items-center justify-center shrink-0">
              <Plus className="h-3.5 w-3.5" />
            </div>
            <span className="text-sm">
               {isSubmitting ? "Processing..." : isLoading ? "Loading..." : "Add Media"}
            </span>
          </button>
        </section>

        {/* Video Guidelines */}
        <div className="border border-border rounded-sm overflow-hidden mt-4">
          <button
            onClick={() => setGuidelinesOpen((v) => !v)}
            className="flex items-center justify-between w-full p-4 bg-card hover:bg-muted/30 transition-colors"
          >
            <span className="text-sm font-medium text-foreground">
              Video Guidelines
            </span>
            <ChevronDown
              className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${
                guidelinesOpen ? "rotate-180" : ""
              }`}
            />
          </button>
          {guidelinesOpen && (
            <div className="border-t border-border p-4 space-y-1.5">
              {[
                "Format: MP4 or WebM (H.264 codec recommended)",
                "Aspect ratio: 9:16 portrait recommended",
                "Max file size: 10MB",
                "Duration: 3–15 seconds (will loop continuously)",
                "Seamless loop point recommended for best experience",
              ].map((g, i) => (
                <p
                  key={i}
                  className="text-xs text-muted-foreground flex items-start gap-2"
                >
                  <span className="text-muted-foreground/50 mt-px">•</span>
                  <span>{g}</span>
                </p>
              ))}
            </div>
          )}
        </div>
      </Layout.AnnotatedSection>
    </Layout>
  );
};

export default BrandingSettings;
