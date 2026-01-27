import Image from "next/image";

interface Props {
    title: string;
    description: string;
    image?:string
}

export const EmptyState = ({
    title,
    description,
    image="/empty.svg"
}: Props) => {
    return (
        <div className="flex flex-col items-center justify-center px-4">
                <Image src={image} alt="empty" width={240} height={240} className="w-40 h-40 md:w-60 md:h-60" style={{ width: 'auto', height: 'auto' }}/>
                <div className="flex flex-col gap-y-4 md:gap-y-6 max-w-md mx-auto text-center">
                    <h6 className="text-base md:text-lg font-medium">{title}</h6>
                    <p className="text-sm text-muted-foreground">{description}</p>
                </div>
            </div>
    )
}