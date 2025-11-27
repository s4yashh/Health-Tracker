import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getCurrentUser } from "@/lib/auth"
import { z } from "zod"

// Force dynamic rendering
export const dynamic = 'force-dynamic'

const checkinSchema = z.object({
  notes: z.string().optional(),
})

// POST /api/habits/[id]/checkin - Check in to habit
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getCurrentUser(request)
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
    }

    const body = await request.json()
    const { notes } = checkinSchema.parse(body)

    // Check if habit exists and belongs to user
    const habit = await prisma.habit.findFirst({
      where: {
        id: params.id,
        userId: user.id,
      },
    })

    if (!habit) {
      return NextResponse.json({ error: "Habit not found" }, { status: 404 })
    }

    const today = new Date()
    today.setHours(0, 0, 0, 0)

    // Check if already completed today/this week
    let existingCompletion
    if (habit.frequency === "daily") {
      const tomorrow = new Date(today)
      tomorrow.setDate(tomorrow.getDate() + 1)

      existingCompletion = await prisma.completion.findFirst({
        where: {
          habitId: params.id,
          userId: user.id,
          completedAt: {
            gte: today,
            lt: tomorrow,
          },
        },
      })
    } else {
      // Weekly - check if completed this week
      const weekStart = new Date(today)
      weekStart.setDate(today.getDate() - today.getDay())
      const weekEnd = new Date(weekStart)
      weekEnd.setDate(weekStart.getDate() + 7)

      existingCompletion = await prisma.completion.findFirst({
        where: {
          habitId: params.id,
          userId: user.id,
          completedAt: {
            gte: weekStart,
            lt: weekEnd,
          },
        },
      })
    }

    if (existingCompletion) {
      return NextResponse.json({ error: "Already completed for this period" }, { status: 400 })
    }

    // Create completion
    const completion = await prisma.completion.create({
      data: {
        habitId: params.id,
        userId: user.id,
        notes: notes?.trim(),
        completedAt: new Date(),
      },
    })

    return NextResponse.json({ completion }, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors[0].message }, { status: 400 })
    }

    console.error("Check-in error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

// DELETE /api/habits/[id]/checkin - Undo check-in
export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getCurrentUser(request)
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
    }

    // Check if habit exists and belongs to user
    const habit = await prisma.habit.findFirst({
      where: {
        id: params.id,
        userId: user.id,
      },
    })

    if (!habit) {
      return NextResponse.json({ error: "Habit not found" }, { status: 404 })
    }

    const today = new Date()
    today.setHours(0, 0, 0, 0)

    // Find and delete today's/this week's completion
    let completion
    if (habit.frequency === "daily") {
      const tomorrow = new Date(today)
      tomorrow.setDate(tomorrow.getDate() + 1)

      completion = await prisma.completion.findFirst({
        where: {
          habitId: params.id,
          userId: user.id,
          completedAt: {
            gte: today,
            lt: tomorrow,
          },
        },
      })
    } else {
      // Weekly
      const weekStart = new Date(today)
      weekStart.setDate(today.getDate() - today.getDay())
      const weekEnd = new Date(weekStart)
      weekEnd.setDate(weekStart.getDate() + 7)

      completion = await prisma.completion.findFirst({
        where: {
          habitId: params.id,
          userId: user.id,
          completedAt: {
            gte: weekStart,
            lt: weekEnd,
          },
        },
      })
    }

    if (!completion) {
      return NextResponse.json({ error: "No completion found for this period" }, { status: 404 })
    }

    await prisma.completion.delete({
      where: { id: completion.id },
    })

    return NextResponse.json({ message: "Check-in removed successfully" })
  } catch (error) {
    console.error("Undo check-in error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
