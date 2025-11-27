import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getCurrentUser } from "@/lib/auth"
import { z } from "zod"

// Force dynamic rendering
export const dynamic = 'force-dynamic'

const updateProfileSchema = z.object({
  username: z.string().min(3, "Username must be at least 3 characters").optional(),
  bio: z.string().max(500, "Bio must be less than 500 characters").optional(),
  avatar: z.string().url("Invalid avatar URL").optional(),
})

// GET /api/profile - Get user profile with stats
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser(request)
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
    }

    // Get user with detailed stats
    const userProfile = await prisma.user.findUnique({
      where: { id: user.id },
      include: {
        habits: {
          include: {
            completions: {
              orderBy: { completedAt: "desc" },
              take: 30,
            },
            _count: {
              select: { completions: true },
            },
          },
        },
        _count: {
          select: {
            habits: true,
            completions: true,
            followers: true,
            following: true,
          },
        },
      },
    })

    if (!userProfile) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    // Calculate streaks and stats for each habit
    const habitsWithStats = userProfile.habits.map((habit) => {
      const { completions, ...habitData } = habit

      // Calculate current streak
      let streak = 0
      const today = new Date()
      today.setHours(0, 0, 0, 0)

      if (habit.frequency === "daily") {
        const checkDate = new Date(today)
        for (const completion of completions) {
          const completionDate = new Date(completion.completedAt)
          completionDate.setHours(0, 0, 0, 0)

          if (completionDate.getTime() === checkDate.getTime()) {
            streak++
            checkDate.setDate(checkDate.getDate() - 1)
          } else if (completionDate.getTime() < checkDate.getTime()) {
            break
          }
        }
      } else {
        // Weekly streak calculation
        const weekStart = new Date(today)
        weekStart.setDate(today.getDate() - today.getDay())

        const checkWeek = new Date(weekStart)
        for (const completion of completions) {
          const completionDate = new Date(completion.completedAt)
          const completionWeekStart = new Date(completionDate)
          completionWeekStart.setDate(completionDate.getDate() - completionDate.getDay())
          completionWeekStart.setHours(0, 0, 0, 0)

          if (completionWeekStart.getTime() === checkWeek.getTime()) {
            streak++
            checkWeek.setDate(checkWeek.getDate() - 7)
          } else if (completionWeekStart.getTime() < checkWeek.getTime()) {
            break
          }
        }
      }

      // Calculate progress percentage (based on completions in last 30 days)
      const thirtyDaysAgo = new Date()
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
      const recentCompletions = completions.filter((c) => new Date(c.completedAt) >= thirtyDaysAgo)
      const expectedCompletions = habit.frequency === "daily" ? 30 : Math.ceil(30 / 7)
      const progress = Math.min(100, Math.round((recentCompletions.length / expectedCompletions) * 100))

      return {
        ...habitData,
        streak,
        progress,
        totalCompletions: habit._count.completions,
      }
    })

    // Calculate overall stats
    const currentStreak = habitsWithStats.length > 0 ? Math.max(...habitsWithStats.map((h) => h.streak)) : 0
    const longestStreak = currentStreak // For now, using current as longest (could be enhanced)

    const profile = {
      id: userProfile.id,
      email: userProfile.email,
      username: userProfile.username,
      bio: userProfile.bio,
      avatar: userProfile.avatar,
      createdAt: userProfile.createdAt,
      totalHabits: userProfile._count.habits,
      totalCompletions: userProfile._count.completions,
      followersCount: userProfile._count.followers,
      followingCount: userProfile._count.following,
      currentStreak,
      longestStreak,
      habits: habitsWithStats,
    }

    return NextResponse.json({ profile })
  } catch (error) {
    console.error("Get profile error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

// PUT /api/profile - Update user profile
export async function PUT(request: NextRequest) {
  try {
    const user = await getCurrentUser(request)
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
    }

    const body = await request.json()
    const updateData = updateProfileSchema.parse(body)

    // Check for duplicate username if username is being updated
    if (updateData.username && updateData.username !== user.username) {
      const existingUser = await prisma.user.findUnique({
        where: { username: updateData.username },
      })

      if (existingUser) {
        return NextResponse.json({ error: "Username already taken" }, { status: 400 })
      }
    }

    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: updateData,
      select: {
        id: true,
        email: true,
        username: true,
        bio: true,
        avatar: true,
        createdAt: true,
      },
    })

    return NextResponse.json({ user: updatedUser })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors[0].message }, { status: 400 })
    }

    console.error("Update profile error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
