import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getCurrentUser } from "@/lib/auth"

// Force dynamic rendering
export const dynamic = 'force-dynamic'

// DELETE /api/friends/[userId] - Unfollow a user
export async function DELETE(request: NextRequest, { params }: { params: { userId: string } }) {
  try {
    const user = await getCurrentUser(request)
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
    }

    const { userId } = params

    // Find and delete friendship
    const friendship = await prisma.friendship.findUnique({
      where: {
        followerId_followingId: {
          followerId: user.id,
          followingId: userId,
        },
      },
    })

    if (!friendship) {
      return NextResponse.json({ error: "Not following this user" }, { status: 404 })
    }

    await prisma.friendship.delete({
      where: { id: friendship.id },
    })

    return NextResponse.json({ message: "Unfollowed successfully" })
  } catch (error) {
    console.error("Unfollow user error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
