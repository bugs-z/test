import { getServerProfile } from "@/lib/server/server-chat-helpers"
import { Database } from "@/supabase/types"
import { createClient } from "@supabase/supabase-js"
import { NextResponse } from "next/server"
import { getRelevantSnippet } from "@/lib/utils"

export async function GET(request: Request) {
  try {
    const query = new URL(request.url).searchParams.get("query")
    if (!query)
      return NextResponse.json({ error: "Missing query" }, { status: 400 })

    const formattedQuery = query
      .split(" ")
      .map(term => `${term}:*`)
      .join(" & ")

    const supabaseAdmin = createClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const profile = await getServerProfile()

    const [{ data: nameMatches }, { data: messageMatches }] = await Promise.all(
      [
        supabaseAdmin
          .from("chats")
          .select("id, name, created_at, updated_at")
          .eq("user_id", profile.user_id)
          .textSearch("name_fts", formattedQuery)
          .limit(15),

        supabaseAdmin
          .from("messages")
          .select(
            `
          content,
          chats!messages_chat_id_fkey!inner(id, name, created_at, updated_at)
        `
          )
          .eq("chats.user_id", profile.user_id)
          .textSearch("content_fts", formattedQuery)
          .limit(15)
      ]
    )

    const results = [
      ...(nameMatches?.map(chat => ({
        chat_id: chat.id,
        title: chat.name,
        created_at: chat.created_at,
        updated_at: chat.updated_at
      })) || []),
      ...(messageMatches?.map(msg => ({
        chat_id: msg.chats.id,
        title: msg.chats.name,
        created_at: msg.chats.created_at,
        updated_at: msg.chats.updated_at,
        preview_message: getRelevantSnippet(msg.content, query)
      })) || [])
    ]

    // Deduplicate keeping first occurrence (prioritizing name matches)
    const uniqueResults = Array.from(
      new Map(results.map(r => [r.chat_id, r])).values()
    ).slice(0, 30)

    return NextResponse.json({
      results: uniqueResults
    })
  } catch (error) {
    console.error("🚨 Search error:", error)
    return NextResponse.json({ error: "Search failed" }, { status: 500 })
  }
}
