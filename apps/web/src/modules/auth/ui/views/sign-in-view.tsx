"use client"
import { z } from "zod"
import { zodResolver } from "@hookform/resolvers/zod"
import { AudioLines, OctagonAlertIcon } from "lucide-react"
import { useForm } from "react-hook-form"
import Link from "next/link"
import { useState } from "react"
import { useRouter } from "next/navigation"
import { FaGithub, FaGoogle } from "react-icons/fa";
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Alert, AlertTitle } from "@/components/ui/alert"
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from "@/components/ui/form"
import { authClient } from "@/lib/auth-client"

const formSchema = z.object({
    email: z.string().email("Invalid email address"),
    password: z.string().min(1, { message: "Password is required" })
})

interface Props {
    redirect?: string
}

export const SignInView = ({ redirect }: Props) => {
    const router = useRouter()
    const [error, setError] = useState<string | null>(null)
    const [pending, setPending] = useState(false)

    const safeRedirect = (value?: string | null) => {
        if (!value) return "/meetings"
        if (!value.startsWith("/")) return "/meetings"
        if (value.startsWith("//")) return "/meetings"
        return value
    }

    const target = safeRedirect(redirect)
    const signUpHref = redirect ? `/sign-up?redirectTo=${encodeURIComponent(target)}` : "/sign-up"

    const form = useForm<z.infer<typeof formSchema>>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            email: "",
            password: "",
        }
    })

    const onSubmit = (data: z.infer<typeof formSchema>) => {
        setError(null)
        setPending(true)

        authClient.signIn.email(
            {
                email: data.email,
                password: data.password,
                callbackURL: target 
            },
            {
                onSuccess: () => {
                    setPending(false)
                    router.push(target)
                },
                onError: ({ error }) => {
                    setPending(false)
                    setError(error.message)
                }
            }
        )
    }

    const onSocial = (provider: "github" | "google") => {
        setError(null)
        setPending(true)

        authClient.signIn.social(
            {
                provider: provider,
                callbackURL: target // This is crucial for Social Auth
            },
            {
                onSuccess: () => {
                    setPending(false)
                    router.push(target)
                },
                onError: ({ error }) => {
                    setPending(false)
                    setError(error.message)
                }
            }
        )
    }

    return (
        <div className="flex flex-col gap-6">
            <Card className="overflow-hidden p-0">
                <CardContent className="grid p-0 md:grid-cols-2">
                    <Form {...form}>
                        <form onSubmit={form.handleSubmit(onSubmit)} className="p-6 md:p-8">
                            <div className="flex flex-col gap-6">
                                <div className="flex flex-col items-center text-center">
                                    <h1 className="text-2xl font-bold">Welcome Back</h1>
                                    <p className="text-muted-foreground text-balance">
                                        Login to your account
                                    </p>
                                </div>
                                
                                {/* 🔄 FIX: Corrected grid-gap-3 to grid gap-3 */}
                                <div className="grid gap-3">
                                    <FormField
                                        control={form.control}
                                        name="email"
                                        render={({ field }) => (
                                            <FormItem id="email">
                                                <FormLabel>Email</FormLabel>
                                                <FormControl>
                                                    <Input
                                                        type="email"
                                                        placeholder="m@example.com"
                                                        {...field} />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )} />
                                </div>
                                <div className="grid gap-3">
                                    <FormField
                                        control={form.control}
                                        name="password"
                                        render={({ field }) => (
                                            <FormItem id="password">
                                                <FormLabel>Password</FormLabel>
                                                <FormControl>
                                                    <Input
                                                        type="password"
                                                        placeholder="********"
                                                        {...field} />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )} />
                                </div>

                                {!!error && (
                                    <Alert className="bg-destructive/10 border-none">
                                        <OctagonAlertIcon className="h-4 w-4 !text-destructive" />
                                        <AlertTitle>{error}</AlertTitle>
                                    </Alert>
                                )}
                                <Button type="submit" className="w-full" disabled={pending}>
                                    Sign in
                                </Button>
                                
                                <div className="after:border-border relative text-center text-sm after:absolute after:inset-0 after:top-1/2 after:z-0 after:flex after:items-center after:border-t">
                                    <span className="bg-card text-muted-foreground relative z-10 px-2">
                                        Or continue with
                                    </span>
                                </div>
                                
                                <div className="grid grid-cols-2 gap-4">
                                    <Button
                                        variant="outline"
                                        type="button"
                                        className="w-full"
                                        disabled={pending}
                                        onClick={() => onSocial("google")}
                                    >
                                        <FaGoogle />
                                    </Button>
                                    <Button
                                        variant="outline"
                                        type="button"
                                        className="w-full"
                                        disabled={pending}
                                        onClick={() => onSocial("github")}
                                    >
                                        <FaGithub />
                                    </Button>
                                </div>
                                
                                <div className="text-center text-sm">
                                    Don&apos;t have an account? {"  "}
                                    <Link href={signUpHref} className="underline underline-offset-4">
                                        Sign up
                                    </Link>
                                </div>
                            </div>
                        </form>
                    </Form>
                    
                    {/* Right side logo section */}
                    <div className="relative hidden md:flex flex-col gap-y-6 items-center justify-center bg-gradient-to-br from-primary/20 via-primary/8 to-muted border-l border-border">
                        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,hsl(var(--primary)/0.12)_0%,transparent_70%)]" />
                        <div className="relative flex flex-col items-center gap-y-4">
                            <div className="w-24 h-24 rounded-2xl bg-primary/15 border border-primary/20 flex items-center justify-center text-primary shadow-lg shadow-primary/10">
                                <AudioLines size={52} />
                            </div>
                            <div className="flex flex-col items-center gap-y-1">
                                <p className="text-2xl font-bold text-foreground">Meet.AI</p>
                                <p className="text-sm text-muted-foreground text-center px-6">AI-powered meetings, re-imagined</p>
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>
            <div className="text-muted-foreground *: [a]:hover:text-primary text-center text-xs text-balance *:[a]:underline *:[a]:underline-offset-4">
                By clicking continue, you agree to our <a href="#">Terms of Service</a> and <a
                    href="#">Privacy Policy</a>
            </div>
        </div>
    )
}