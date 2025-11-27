import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getCurrentUser } from "@/lib/auth"
import { z } from "zod"

// Force dynamic rendering
export const dynamic = 'force-dynamic'

const updateHabitSchema = z.object({
  name: z.string().min(1, "Habit name is required").max(100, "Habit name too long").optional(),
  category: z.enum(["health", "study", "personal", "work"]).optional(),
  frequency: z.enum(["daily", "weekly"]).optional(),
  notes: z.string().optional(),
  color: z.string().optional(),
})

// PUT /api/habits/[id] - Update habit
export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getCurrentUser(request)
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
    }

    const body = await request.json()
    const updateData = updateHabitSchema.parse(body)

    // Check if habit exists and belongs to user
    const existingHabit = await prisma.habit.findFirst({
      where: {
        id: params.id,
        userId: user.id,
      },
    })

    if (!existingHabit) {
      return NextResponse.json({ error: "Habit not found" }, { status: 404 })
    }

    // Check for duplicate name if name is being updated
    if (updateData.name && updateData.name !== existingHabit.name) {
      const duplicateHabit = await prisma.habit.findFirst({
        where: {
          userId: user.id,
          name: updateData.name.trim(),
          id: { not: params.id },
        },
      })

      if (duplicateHabit) {
        return NextResponse.json({ error: "You already have a habit with this name" }, { status: 400 })
      }
    }

    const habit = await prisma.habit.update({
      where: { id: params.id },
      data: {
        ...updateData,
        name: updateData.name?.trim(),
        notes: updateData.notes?.trim(),
      },
    })

    return NextResponse.json({ habit })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors[0].message }, { status: 400 })
    }

    console.error("Update habit error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

// DELETE /api/habits/[id] - Delete habit
export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getCurrentUser(request)
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
    }

    // Check if habit exists and belongs to user
    const existingHabit = await prisma.habit.findFirst({
      where: {
        id: params.id,
        userId: user.id,
      },
    })

    if (!existingHabit) {
      return NextResponse.json({ error: "Habit not found" }, { status: 404 })
    }

    await prisma.habit.delete({
      where: { id: params.id },
    })

    return NextResponse.json({ message: "Habit deleted successfully" })
  } catch (error) {
    console.error("Delete habit error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
