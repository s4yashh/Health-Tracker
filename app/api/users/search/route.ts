import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getCurrentUser } from "@/lib/auth"

// Force dynamic rendering
export const dynamic = 'force-dynamic'

// GET /api/users/search - Search for users to follow
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser(request)
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const query = searchParams.get("q") || ""

    // Get users that current user is already following
    const following = await prisma.friendship.findMany({
      where: { followerId: user.id },
      select: { followingId: true },
    })

    const followingIds = following.map((f) => f.followingId)

    // Search for users (excluding self and already followed users)
    const users = await prisma.user.findMany({
      where: {
        AND: [
          { id: { not: user.id } }, // Exclude self
          { id: { notIn: followingIds } }, // Exclude already followed
          {
            OR: [
              { username: { contains: query, mode: "insensitive" } },
              { email: { contains: query, mode: "insensitive" } },
            ],
          },
        ],
      },
      select: {
        id: true,
        username: true,
        avatar: true,
        bio: true,
        _count: {
          select: {
            habits: true,
            completions: true,
            followers: true,
          },
        },
      },
      take: 20,
      orderBy: { createdAt: "desc" },
    })

    const usersWithStats = users.map((u) => ({
      ...u,
      totalHabits: u._count.habits,
      totalCompletions: u._count.completions,
      followersCount: u._count.followers,
    }))

    return NextResponse.json({ users: usersWithStats })
  } catch (error) {
    console.error("Search users error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
