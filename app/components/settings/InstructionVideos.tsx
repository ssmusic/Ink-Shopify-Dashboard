import { useState } from "react";
import { Smartphone, Apple, Play } from "lucide-react";
import { Button } from "../ui/button";
import { Checkbox } from "../ui/checkbox";
import { Label } from "../ui/label";
import { Switch } from "../ui/switch";
import { Slider } from "../ui/slider";
import { Badge } from "../ui/badge";
import { toast } from "../../hooks/use-toast";
import MediaMetadataPanel from "./MediaMetadataPanel";

const InstructionVideos = () => {
  const [activeDevice, setActiveDevice] = useState<"iphone" | "android">("iphone");
  const [includeInEmails, setIncludeInEmails] = useState(true);
  const [loopVideo, setLoopVideo] = useState(true);
  const [duration, setDuration] = useState(5);

  const handleToggle = () => {
    setIncludeInEmails(!includeInEmails);
    toast({
      description: "Saved",
      duration: 1500,
    });
  };

  const handleLoopToggle = () => {
    setLoopVideo(!loopVideo);
    toast({
      description: loopVideo ? "Loop disabled" : "Loop enabled",
      duration: 1500,
    });
  };

  const handleDurationChange = (value: number[]) => {
    setDuration(value[0]);
  };

  const handleDurationCommit = () => {
    toast({
      description: `Duration set to ${duration}s`,
      duration: 1500,
    });
  };

  const deviceData = {
    iphone: {
      name: "iPhone",
      icon: Apple,
      format: "MOV (H.265)",
      resolution: "1080 × 1920",
    },
    android: {
      name: "Android",
      icon: Smartphone,
      format: "MP4 (H.264)",
      resolution: "1080 × 1920",
    },
  };

  const currentDevice = deviceData[activeDevice];

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-base font-medium text-foreground">Tap Instructions</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Device-specific videos showing customers how to tap their package.
          </p>
        </div>
        <Badge variant="outline" className="text-xs shrink-0">
          {includeInEmails ? "Active" : "Disabled"}
        </Badge>
      </div>

      {/* Enable Toggle */}
      <div className="flex items-start gap-3 p-4 bg-card border border-border rounded-sm">
        <Checkbox
          id="includeInEmails"
          checked={includeInEmails}
          onCheckedChange={handleToggle}
          className="mt-0.5"
        />
        <div>
          <Label htmlFor="includeInEmails" className="text-sm font-medium text-foreground cursor-pointer">
            Include in reminder emails
          </Label>
          <p className="text-xs text-muted-foreground mt-0.5">
            Automatically shows the correct video based on customer's device.
          </p>
        </div>
      </div>

      {/* Preview Section */}
      <div className={includeInEmails ? "" : "opacity-50 pointer-events-none"}>
        {/* Device Toggle */}
        <div className="flex gap-2 mb-4">
          <Button
            variant={activeDevice === "iphone" ? "default" : "outline"}
            size="sm"
            onClick={() => setActiveDevice("iphone")}
            className="gap-2"
          >
            <Apple className="h-4 w-4" />
            iPhone
          </Button>
          <Button
            variant={activeDevice === "android" ? "default" : "outline"}
            size="sm"
            onClick={() => setActiveDevice("android")}
            className="gap-2"
          >
            <Smartphone className="h-4 w-4" />
            Android
          </Button>
        </div>

        {/* Video Preview with Metadata */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr,280px] gap-0 bg-card border border-border rounded-sm overflow-hidden">
          {/* Preview area */}
          <div className="relative aspect-video lg:aspect-auto lg:min-h-[240px] bg-muted flex items-center justify-center">
            <div className="text-center p-6">
              <div className="w-16 h-16 bg-background/80 rounded-full flex items-center justify-center mx-auto mb-4">
                <currentDevice.icon className="h-8 w-8 text-foreground" />
              </div>
              <p className="text-sm font-medium text-foreground mb-1">
                {currentDevice.name} Tap Instructions
              </p>
              <p className="text-xs text-muted-foreground">
                Shows how to tap NFC on {activeDevice === "iphone" ? "iOS" : "Android"} devices
              </p>
            </div>
            {/* Play indicator */}
            <div className="absolute bottom-3 left-3 flex items-center gap-1.5 bg-background/80 px-2 py-1 rounded-sm">
              <Play className="h-3 w-3 fill-current" />
              <span className="text-xs font-medium">{duration}s • {loopVideo ? "Loop" : "Once"}</span>
            </div>
          </div>

          {/* Metadata panel */}
          <div className="p-4 border-t lg:border-t-0 lg:border-l border-border">
            <MediaMetadataPanel
              fileName={`tap_instruction_${activeDevice}.mp4`}
              format={currentDevice.format}
              fileSize="1.2 MB"
              duration={`${duration} seconds ${loopVideo ? "(loops)" : ""}`}
              resolution={currentDevice.resolution}
              lastUpdated="Default"
              onPreview={() => toast({ description: "Preview opened" })}
            />
          </div>
        </div>

        {/* Video Controls */}
        <div className="space-y-4 mt-4 p-4 bg-card border border-border rounded-sm">
          {/* Loop Toggle */}
          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="loopVideo" className="text-sm font-medium text-foreground">
                Loop playback
              </Label>
              <p className="text-xs text-muted-foreground">
                Continuously replay the instruction video
              </p>
            </div>
            <Switch
              id="loopVideo"
              checked={loopVideo}
              onCheckedChange={handleLoopToggle}
            />
          </div>

          {/* Duration Slider */}
          <div className="pt-4 border-t border-border">
            <div className="flex items-center justify-between mb-3">
              <Label className="text-sm font-medium text-foreground">
                Duration
              </Label>
              <span className="text-sm font-medium tabular-nums bg-muted px-2 py-0.5 rounded">{duration}s</span>
            </div>
            <Slider
              value={[duration]}
              onValueChange={handleDurationChange}
              onValueCommit={handleDurationCommit}
              min={3}
              max={15}
              step={1}
              className="w-full"
            />
            <div className="flex justify-between mt-2">
              <span className="text-xs text-muted-foreground">3 seconds</span>
              <span className="text-xs text-muted-foreground">15 seconds</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default InstructionVideos;
