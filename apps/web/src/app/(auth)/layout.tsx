import { ThemeToggle } from "@/components/theme-toggle"

interface Props {
    children:React.ReactNode;
}

const Layout = ({children}:Props)=>{
    return (
        <div className="bg-muted flex min-h-svh flex-col items-center justify-center p-6 md:p-10 relative">
            <div className="absolute top-4 right-4">
                <ThemeToggle />
            </div>
            <div className="w-full max-w-sm md:max-w-3xl">
                {children}
            </div>
        </div>
    )
}

export default Layout