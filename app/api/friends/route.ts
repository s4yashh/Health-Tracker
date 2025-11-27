import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getCurrentUser } from "@/lib/auth"
import { z } from "zod"

// Force dynamic rendering
export const dynamic = 'force-dynamic'

const followSchema = z.object({
  userId: z.string().min(1, "User ID is required"),
})

// GET /api/friends - Get user's friends and activity feed
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser(request)
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const type = searchParams.get("type") || "activity"

    if (type === "following") {
      // Get users that current user is following
      const following = await prisma.friendship.findMany({
        where: { followerId: user.id },
        include: {
          following: {
            select: {
              id: true,
              username: true,
              avatar: true,
              bio: true,
              _count: {
                select: {
                  habits: true,
                  completions: true,
                },
              },
            },
          },
        },
        orderBy: { createdAt: "desc" },
      })

      return NextResponse.json({
        following: following.map((f) => ({
          ...f.following,
          totalHabits: f.following._count.habits,
          totalCompletions: f.following._count.completions,
        })),
      })
    }

    if (type === "followers") {
      // Get users that are following current user
      const followers = await prisma.friendship.findMany({
        where: { followingId: user.id },
        include: {
          follower: {
            select: {
              id: true,
              username: true,
              avatar: true,
              bio: true,
              _count: {
                select: {
                  habits: true,
                  completions: true,
                },
              },
            },
          },
        },
        orderBy: { createdAt: "desc" },
      })

      return NextResponse.json({
        followers: followers.map((f) => ({
          ...f.follower,
          totalHabits: f.follower._count.habits,
          totalCompletions: f.follower._count.completions,
        })),
      })
    }

    // Default: Get activity feed from followed users
    const followedUsers = await prisma.friendship.findMany({
      where: { followerId: user.id },
      select: { followingId: true },
    })

    const followedUserIds = followedUsers.map((f) => f.followingId)

    // Get recent completions from followed users
    const recentActivity = await prisma.completion.findMany({
      where: {
        userId: { in: followedUserIds },
      },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            avatar: true,
          },
        },
        habit: {
          select: {
            id: true,
            name: true,
            category: true,
            frequency: true,
            color: true,
          },
        },
      },
      orderBy: { completedAt: "desc" },
      take: 50,
    })

    // Calculate streaks for each activity
    const activityWithStreaks = await Promise.all(
      recentActivity.map(async (activity) => {
        // Get user's current streak for this habit
        const habit = await prisma.habit.findUnique({
          where: { id: activity.habitId },
          include: {
            completions: {
              where: { userId: activity.userId },
              orderBy: { completedAt: "desc" },
              take: 30,
            },
          },
        })

        let streak = 0
        if (habit) {
          const today = new Date()
          today.setHours(0, 0, 0, 0)

          if (habit.frequency === "daily") {
            const checkDate = new Date(today)
            for (const completion of habit.completions) {
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
            for (const completion of habit.completions) {
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
        }

        return {
          ...activity,
          streak,
        }
      }),
    )

    return NextResponse.json({ activity: activityWithStreaks })
  } catch (error) {
    console.error("Get friends error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

// POST /api/friends - Follow a user
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser(request)
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
    }

    const body = await request.json()
    const { userId } = followSchema.parse(body)

    // Prevent following self
    if (userId === user.id) {
      return NextResponse.json({ error: "Cannot follow yourself" }, { status: 400 })
    }

    // Check if target user exists
    const targetUser = await prisma.user.findUnique({
      where: { id: userId },
    })

    if (!targetUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    // Check if already following
    const existingFriendship = await prisma.friendship.findUnique({
      where: {
        followerId_followingId: {
          followerId: user.id,
          followingId: userId,
        },
      },
    })

    if (existingFriendship) {
      return NextResponse.json({ error: "Already following this user" }, { status: 400 })
    }

    // Create friendship
    const friendship = await prisma.friendship.create({
      data: {
        followerId: user.id,
        followingId: userId,
      },
    })

    return NextResponse.json({ friendship }, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors[0].message }, { status: 400 })
    }

    console.error("Follow user error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
