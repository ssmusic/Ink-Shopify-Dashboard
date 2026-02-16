import { Info } from "lucide-react";

interface VideoGuidelinesProps {
  className?: string;
}

const VideoGuidelines = ({ className = "" }: VideoGuidelinesProps) => {
  const guidelines = [
    "Format: MP4 or WebM (H.264 codec recommended)",
    "Aspect ratio: 16:9 (1920×1080 recommended)",
    "Max file size: 2MB",
    "Duration: 2-5 seconds (will loop continuously)",
    "Seamless loop point recommended for best experience",
  ];

  return (
    <div className={`bg-muted/30 border border-border rounded-sm p-4 ${className}`}>
      <div className="flex items-start gap-2 mb-3">
        <Info className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
        <h4 className="text-sm font-medium text-foreground">Video Guidelines</h4>
      </div>
      <ul className="space-y-1.5 ml-6">
        {guidelines.map((guideline, index) => (
          <li key={index} className="text-xs text-muted-foreground flex items-start gap-2">
            <span className="text-muted-foreground/60 mt-1">•</span>
            <span>{guideline}</span>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default VideoGuidelines;
