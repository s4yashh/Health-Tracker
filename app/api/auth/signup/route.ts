import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { hashPassword, generateToken, setAuthCookie } from "@/lib/auth"
import { z } from "zod"

// Force Node.js runtime and dynamic rendering
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Validation schema for signup request
const signupSchema = z.object({
  email: z
    .string()
    .email("Invalid email address")
    .min(1, "Email is required")
    .max(255, "Email is too long")
    .trim()
    .toLowerCase(),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(100, "Password is too long")
    .regex(
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)[A-Za-z\d@$!%*?&]{8,}$/,
      "Password must contain at least one uppercase letter, one lowercase letter, and one number"
    ),
  username: z
    .string()
    .min(3, "Username must be at least 3 characters")
    .max(30, "Username is too long")
    .regex(/^[a-zA-Z0-9_-]+$/, "Username can only contain letters, numbers, underscores, and hyphens")
    .trim(),
})

export async function POST(request: NextRequest) {
  try {
    console.log('Starting signup process...')
    
    // Diagnostic logging for environment and Prisma
    console.log('Environment check:', {
      nodeEnv: process.env.NODE_ENV,
      hasDatabaseUrl: !!process.env.DATABASE_URL,
      databaseUrlLength: process.env.DATABASE_URL?.length,
      hasJwtSecret: !!process.env.JWT_SECRET,
      hasJwtExpiresIn: !!process.env.JWT_EXPIRES_IN,
    })
    
    if (!process.env.DATABASE_URL) {
      console.error('CRITICAL: DATABASE_URL environment variable is not set!')
      return NextResponse.json({
        error: "Server configuration error: DATABASE_URL not set",
        debug: process.env.NODE_ENV === "production" ? undefined : { env: 'DATABASE_URL missing' }
      }, { status: 500 })
    }
    
    // Parse and validate request body
    const body = await request.json()
    console.log('Received signup request:', { ...body, password: '[REDACTED]' })
    
    const validatedData = signupSchema.parse(body)
    const { email, password, username } = validatedData
    console.log('Validation passed for:', { email, username })

    // Check for existing user with timeout
    console.log('Checking for existing user...')
    let existingUser
    try {
      existingUser = await Promise.race([
        prisma.user.findFirst({
          where: {
            OR: [
              { email: { equals: email, mode: "insensitive" } },
              { username: { equals: username, mode: "insensitive" } },
            ],
          },
        }),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Database query timeout')), 15000)
        )
      ])
    } catch (dbError) {
      console.error('Database error during user lookup:', dbError)
      throw new Error('Database connection failed. Please try again later.')
    }

    if (existingUser && typeof existingUser === 'object' && 'email' in existingUser) {
      const user = existingUser as { email: string }
      return NextResponse.json({
        error: user.email.toLowerCase() === email.toLowerCase()
          ? "Email already registered"
          : "Username already taken"
      }, { status: 400 })
    }

    // Create new user with hashed password
    console.log('Hashing password...')
    const hashedPassword = await hashPassword(password)
    
    console.log('Creating user in database...')
    let newUser
    try {
      newUser = await Promise.race([
        prisma.user.create({
          data: {
            email,
            username,
            password: hashedPassword,
          },
          select: {
            id: true,
            email: true,
            username: true,
            bio: true,
            avatar: true,
            createdAt: true,
          },
        }),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Database query timeout')), 15000)
        )
      ])
    } catch (dbError) {
      console.error('Database error during user creation:', dbError)
      throw new Error('Failed to create user. Please try again later.')
    }

    // Validate newUser
    if (!newUser || typeof newUser !== 'object' || !('id' in newUser)) {
      console.error('Invalid user object created')
      throw new Error('Failed to create user properly')
    }

    const user = newUser as { id: string; email: string; username: string; bio?: string; avatar?: string; createdAt: string }

    // Generate authentication token
    console.log("Generating JWT token...")
    const token = await generateToken(user.id)
    console.log("Token generated, length:", token.length)

    // Create response with user data
    const response = NextResponse.json({
      success: true,
      user: user,
      message: "Registration successful"
    }, { status: 201 })

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

    console.log("Sending signup response...")
    return response
  } catch (error) {
    console.error("Signup error:", error)
    const errorMessage = error instanceof Error ? error.message : String(error)
    console.error("Error details:", errorMessage)

    // Handle validation errors
    if (error instanceof z.ZodError) {
      return NextResponse.json({
        error: error.errors[0].message
      }, { status: 400 })
    }

    // Handle specific error messages
    if (errorMessage.includes('Database') || errorMessage.includes('timeout') || errorMessage.includes('connection')) {
      return NextResponse.json({
        error: "Database connection failed. Please try again later."
      }, { status: 503 })
    }

    // Handle other errors
    return NextResponse.json({
      error: errorMessage || "Registration failed. Please try again later."
    }, { status: 500 })
  }
}

