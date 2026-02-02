import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { participantRole, ParticipantRole } from "@/db/schema";
import { useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { getMeetingInviteLink } from "../../server/meetingInvite";
import { Spinner } from "@/components/ui/spinner";

interface Props {
    open: boolean;
    onOpenChange: (open: boolean) => void
    meetingId: string;
}
export function ShareDialog({ open, onOpenChange, meetingId }: Props) {
  const [selectedRole, setSelectedRole] = useState<ParticipantRole | "">("");
  const [loading, setLoading] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const options = participantRole.enumValues as readonly ParticipantRole[];

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      setUrl("");
    }
    onOpenChange(newOpen);
  };

  const handleCopyLink = async (role: ParticipantRole) => {
    if (!role) return;
    setLoading(true);
    try {
      // Call the Server Action to get/create the link
      const generatedUrl = await getMeetingInviteLink(meetingId, role);
      setUrl(generatedUrl);
      await navigator.clipboard.writeText(generatedUrl);
      toast.success(`Copied ${role} invite link!`);
    } catch {
      toast.error("Failed to generate link");
    } finally {
      setLoading(false);
    }
  };

  const handleShareViaOS = () => {
    if (url) {
      navigator.share?.({ url });
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Share this link</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div>
            <label className="text-sm font-medium">Select Role:</label>
            <Select value={selectedRole} onValueChange={(value) => setSelectedRole(value as ParticipantRole)}>
              <SelectTrigger>
                <SelectValue placeholder="Choose a role" />
              </SelectTrigger>
              <SelectContent>
                {options.map((option) => (
                  <SelectItem key={option} value={option}>
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {url && (
            <div>
              <label className="text-sm font-medium">Share URL:</label>
              <input type="text" readOnly value={url} className="w-full p-2 border rounded" />
            </div>
          )}
          <div className="flex gap-2">
            <Button 
              onClick={() => handleCopyLink(selectedRole as ParticipantRole)} 
              disabled={!selectedRole || loading}
            >
              {loading ? (
                <>
                  <Spinner className="mr-2" />
                  Generating...
                </>
              ) : (
                "Generate & Copy Link"
              )}
            </Button>
            <Button onClick={handleShareViaOS} disabled={!url || loading}>
              Share via OS
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
