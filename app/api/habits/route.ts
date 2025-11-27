import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getCurrentUser } from "@/lib/auth"
import { z } from "zod"

// Force dynamic rendering
export const dynamic = 'force-dynamic'

const createHabitSchema = z.object({
  name: z.string().min(1, "Habit name is required").max(100, "Habit name too long"),
  category: z.enum(["health", "study", "personal", "work"], {
    errorMap: () => ({ message: "Invalid category" }),
  }),
  frequency: z.enum(["daily", "weekly"], {
    errorMap: () => ({ message: "Frequency must be daily or weekly" }),
  }),
  notes: z.string().optional(),
  color: z.string().optional(),
})

// GET /api/habits - Get user's habits
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser(request)
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
    }

    const habits = await prisma.habit.findMany({
      where: { userId: user.id },
      include: {
        completions: {
          orderBy: { completedAt: "desc" },
          take: 30, // Last 30 completions for streak calculation
        },
        _count: {
          select: { completions: true },
        },
      },
      orderBy: { createdAt: "desc" },
    })

    // Calculate streaks and progress for each habit
    const habitsWithStats = habits.map((habit) => {
      const { completions, ...habitData } = habit

      // Calculate current streak
      let streak = 0
      const today = new Date()
      today.setHours(0, 0, 0, 0)

      if (habit.frequency === "daily") {
        // Check consecutive days
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

      // Check if completed today/this week
      const completedToday = completions.some((completion) => {
        const completionDate = new Date(completion.completedAt)
        if (habit.frequency === "daily") {
          completionDate.setHours(0, 0, 0, 0)
          return completionDate.getTime() === today.getTime()
        } else {
          const weekStart = new Date(today)
          weekStart.setDate(today.getDate() - today.getDay())
          const completionWeekStart = new Date(completionDate)
          completionWeekStart.setDate(completionDate.getDate() - completionDate.getDay())
          return completionWeekStart.getTime() === weekStart.getTime()
        }
      })

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
        completedToday,
        totalCompletions: habit._count.completions,
      }
    })

    return NextResponse.json({ habits: habitsWithStats })
  } catch (error) {
    console.error("Get habits error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

// POST /api/habits - Create new habit
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser(request)
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
    }

    const body = await request.json()
    const { name, category, frequency, notes, color } = createHabitSchema.parse(body)

    // Check for duplicate habit name for this user
    const existingHabit = await prisma.habit.findFirst({
      where: {
        userId: user.id,
        name: name.trim(),
      },
    })

    if (existingHabit) {
      return NextResponse.json({ error: "You already have a habit with this name" }, { status: 400 })
    }

    const habit = await prisma.habit.create({
      data: {
        name: name.trim(),
        category,
        frequency,
        notes: notes?.trim(),
        color: color || "#3b82f6",
        userId: user.id,
      },
    })

    return NextResponse.json({ habit }, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors[0].message }, { status: 400 })
    }

    console.error("Create habit error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
