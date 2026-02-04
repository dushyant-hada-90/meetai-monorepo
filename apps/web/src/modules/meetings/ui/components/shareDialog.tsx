import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { participantRole, ParticipantRole } from "@/db/schema";
import { useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { getMeetingInviteLink } from "../../server/meetingInvite";
import { Spinner } from "@/components/ui/spinner";
import {
  Copy,
  Check,
  Share2,
  Link,
  UserCog,
  Wand2,
} from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  meetingId: string;
}

export function ShareDialog({ open, onOpenChange, meetingId }: Props) {
  const [selectedRole, setSelectedRole] = useState<ParticipantRole | "">("");
  const [loading, setLoading] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const options = participantRole.enumValues as readonly ParticipantRole[];

  const handleGenerateLink = async () => {
    if (!selectedRole) return;
    setLoading(true);
    try {
      const generatedUrl = await getMeetingInviteLink(
        meetingId,
        selectedRole as ParticipantRole
      );
      setUrl(generatedUrl);
      toast.success("Invite link generated");
    } catch {
      toast.error("Failed to generate invite link");
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    if (!url) return;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    toast.success("Copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  };

  const handleShareViaOS = () => {
    url && navigator.share?.({ url });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link className="h-5 w-5 text-muted-foreground" />
            Share meeting
          </DialogTitle>
          <DialogDescription>
            Generate a role-based invite link to share access.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {/* Role selector */}
          <Select
            value={selectedRole}
            onValueChange={(v) => setSelectedRole(v as ParticipantRole)}
          >
            <SelectTrigger className="h-11">
              <UserCog className="mr-2 h-4 w-4 text-muted-foreground" />
              <SelectValue placeholder="Select participant role" />
            </SelectTrigger>
            <SelectContent>
              {options.map((role) => (
                <SelectItem key={role} value={role}>
                  {role}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Generated URL */}
          {url && (
            <div className="flex items-center gap-2 rounded-md border px-3 py-2">
              <input
                readOnly
                value={url}
                className="flex-1 bg-transparent text-sm outline-none"
              />
              <Button
                size="icon"
                variant="ghost"
                onClick={handleCopy}
                aria-label="Copy link"
              >
                {copied ? (
                  <Check className="h-4 w-4 text-green-600" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-between gap-2">
            <Button
              className="flex-1"
              onClick={handleGenerateLink}
              disabled={!selectedRole || loading}
            >
              {loading ? (
                <>
                  <Spinner className="mr-2 h-4 w-4" />
                  Generating
                </>
              ) : (
                <>
                  <Wand2 className="mr-2 h-4 w-4" />
                  Generate link
                </>
              )}
            </Button>

            {url && (
              <Button
                size="icon"
                variant="secondary"
                onClick={handleShareViaOS}
                aria-label="Share link"
              >
                <Share2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
