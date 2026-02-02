import {Polar} from "@polar-sh/sdk"

const isResourceNotFoundError = (error: unknown): error is { error?: string } => {
    return Boolean(
        error &&
        typeof error === "object" &&
        "error" in error &&
        (error as { error?: string }).error === "ResourceNotFound"
    )
}

export const polarClient = new Polar({
    accessToken: process.env.POLAR_ACCESS_TOKEN,
    server: "sandbox",
})

export const getCustomerStateSafe = async (externalId: string) => {
    try {
        return await polarClient.customers.getStateExternal({
            externalId,
        })
    } catch (error) {
        if (isResourceNotFoundError(error)) {
            return null
        }

        throw error
    }
}
