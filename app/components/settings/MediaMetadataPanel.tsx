import { Button } from "../ui/button";
import { Play, Download } from "lucide-react";

interface MediaMetadataProps {
  fileName?: string;
  format?: string;
  fileSize?: string;
  duration?: string;
  resolution?: string;
  lastUpdated?: string;
  onPreview?: () => void;
  onDownload?: () => void;
}

const MediaMetadataPanel = ({
  fileName = "—",
  format = "—",
  fileSize = "—",
  duration = "—",
  resolution = "—",
  lastUpdated = "—",
  onPreview,
  onDownload,
}: MediaMetadataProps) => {
  const rows = [
    { label: "File Name", value: fileName },
    { label: "Format", value: format },
    { label: "File Size", value: fileSize },
    { label: "Duration", value: duration },
    { label: "Resolution", value: resolution },
    { label: "Last Updated", value: lastUpdated },
  ];

  return (
    <div className="space-y-4">
      {/* Metadata rows */}
      <div className="space-y-2">
        {rows.map((row) => (
          <div key={row.label} className="flex justify-between text-sm">
            <span className="text-muted-foreground">{row.label}</span>
            <span className="text-foreground font-medium text-right">{row.value}</span>
          </div>
        ))}
      </div>

      {/* Action buttons */}
      {(onPreview || onDownload) && (
        <div className="flex gap-2 pt-2 border-t border-border">
          {onPreview && (
            <Button
              variant="outline"
              size="sm"
              onClick={onPreview}
              className="flex-1 gap-2"
            >
              <Play className="h-3 w-3" />
              Preview
            </Button>
          )}
          {onDownload && (
            <Button
              variant="outline"
              size="sm"
              onClick={onDownload}
              className="flex-1 gap-2"
            >
              <Download className="h-3 w-3" />
              Download
            </Button>
          )}
        </div>
      )}
    </div>
  );
};

export default MediaMetadataPanel;
