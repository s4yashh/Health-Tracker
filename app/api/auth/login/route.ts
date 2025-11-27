import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { verifyPassword, generateToken } from "@/lib/auth"
import { z } from "zod"

// Force Node.js runtime and dynamic rendering
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
})

export async function POST(request: NextRequest) {
  console.log("Login request received")
  
  try {
    // Parse request body
    const body = await request.json()
    console.log("Login attempt for email:", body.email)
    
    // Validate request data
    const { email, password } = loginSchema.parse(body)
    console.log("Input validation passed")

    // Find user by email (case-insensitive)
    const user = await prisma.user.findFirst({
      where: {
        email: {
          equals: email.toLowerCase(),
          mode: "insensitive"
        }
      },
    })

    console.log("User lookup result:", user ? "Found" : "Not found")

    if (!user) {
      console.log("Login failed: User not found")
      return NextResponse.json({ error: "Invalid email or password" }, { status: 401 })
    }

    // Verify password
    console.log("Verifying password...")
    const isValidPassword = await verifyPassword(password, user.password)
    console.log("Password verification:", isValidPassword ? "Success" : "Failed")

    if (!isValidPassword) {
      console.log("Login failed: Invalid password")
      return NextResponse.json({ error: "Invalid email or password" }, { status: 401 })
    }

    // Generate JWT token
    console.log("Generating JWT token...")
    const token = await generateToken(user.id)
    console.log("Token generated, length:", token.length)

    // Create response with user data
    const response = NextResponse.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        bio: user.bio,
        avatar: user.avatar,
      },
    })

    // Set secure httpOnly cookie with proper attributes
    console.log("Setting auth cookie...")
    response.cookies.set("auth-token", token, {
      httpOnly: true,
      secure: true,
      sameSite: "strict",
      path: "/",
      maxAge: 60 * 60 * 24 * 7, // 7 days
      priority: "high"
    })

    // Log cookie details
    const cookies = response.headers.get('set-cookie')
    console.log("Cookie header set:", cookies ? "Yes" : "No")
    console.log("Cookie details:", {
      name: "auth-token",
      options: {
        httpOnly: true,
        secure: true,
        sameSite: "strict",
        path: "/",
        maxAge: 60 * 60 * 24 * 7,
      }
    })

    console.log("Sending login response...")
    return response
  } catch (error) {
    console.error("Login error:", error)
    
    if (error instanceof z.ZodError) {
      const errorMessage = error.errors[0].message
      console.log("Validation error:", errorMessage)
      return NextResponse.json({ error: errorMessage }, { status: 400 })
    }
    
    return NextResponse.json({ 
      error: "Login failed. Please try again." 
    }, { status: 500 })
  }
}
