import { type NextRequest, NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"

// Force Node.js runtime and dynamic rendering
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    console.log("GET /me: Checking authentication...")
    
    // Log all cookies
    const allCookies = request.cookies.getAll()
    console.log("Available cookies:", allCookies.map(c => c.name))
    
    // Check if the token exists
    const token = request.cookies.get("auth-token")?.value
    console.log("Auth token present:", token ? "Yes" : "No")
    
    if (!token) {
      console.log("GET /me: No auth token found")
      return NextResponse.json({ error: "No authentication token" }, { status: 401 })
    }

    // Get the current user
    console.log("GET /me: Verifying token and fetching user...")
    const user = await getCurrentUser(request)
    console.log("GET /me: User found:", user ? "Yes" : "No")

    if (!user) {
      console.log("GET /me: Invalid token or user not found")
      // Clear invalid token
      const response = NextResponse.json({ error: "Invalid authentication token" }, { status: 401 })
      response.cookies.set("auth-token", "", {
        httpOnly: true,
        secure: true,
        sameSite: "strict",
        path: "/",
        maxAge: 0,
      })
      return response
    }

    console.log("GET /me: Returning user data")
    return NextResponse.json({ user })
  } catch (error) {
    console.error("Get user error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
