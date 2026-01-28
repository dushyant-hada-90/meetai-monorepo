import { Avatar, AvatarImage } from "@/components/ui/avatar"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { generateAvatarUri } from "@/lib/avatar"
import { useTRPC } from "@/trpc/client"
import { useQuery } from "@tanstack/react-query"
import { format } from "date-fns"
import { SearchIcon } from "lucide-react"
import { useState } from "react"
import Highlighter from "react-highlight-words"

interface Props {
    meetingId: string
}

export const Transcript = ({ meetingId }: Props) => {
    const trpc = useTRPC()
    const { data } = useQuery(trpc.meetings.getTranscript.queryOptions({ id: meetingId }))
    console.log(data)
    const [searchQuery, setSearchQuery] = useState("")

    const filteredData = (data ?? []).filter((item) =>
        item.text.toString().toLowerCase().includes(searchQuery.toLowerCase())
    )

    return (
        <div className="bg-white rounded-lg border px-4 py-5 flex flex-col gap-y-4 w-full">
            <p className="text-sm font-medium">Transcript</p>
            < div className="relative" >
                <Input
                    placeholder="Search Transcript"
                    className="pl-7 h-9 w-[240px]"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                />
                <SearchIcon className="absolute left-2 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            </div >
            <ScrollArea>
                <div className="flex flex-col gap-y-4">
                    {filteredData.map((item, index) => {
                        return (
                            <div
                                key={index}
                                className="flex flex-col gap-y-2 hover:bg-muted p-4 rounded-md border"
                            >
                                <div className="flex gap-x-2 items-center">
                                    <Avatar className="size-6">
                                        <AvatarImage
                                            src={
                                                item.role === "assistant" ?
                                                    generateAvatarUri({ seed: item.speaker, variant: "botttsNeutral" }) :
                                                    item.image ?? generateAvatarUri({ seed: item.speaker, variant: "initials" })
                                            }
                                            alt="User Avatar"
                                        />
                                    </Avatar>
                                    <p className="text-sm font-medium">{item.speaker}</p>
                                    <p className="text-sm text-blue-500 font-medium">
                                        {format(new Date(item.time), "p")}
                                    </p>
                                </div>
                                <Highlighter
                                    className="text-sm text-neutral-700"
                                    highlightClassName="bg-yellow-200"
                                    searchWords={[searchQuery]}
                                    autoEscape={true}
                                    textToHighlight={item.text}
                                />
                            </div>
                        )
                    })}
                </div>
            </ScrollArea>
        </div>
    )
}