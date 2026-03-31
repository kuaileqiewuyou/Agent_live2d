def build_companion_prompt(
    *,
    persona: dict,
    user_input: str,
    recent_messages: list[dict],
    summary_memory: list[dict],
    long_term_memories: list[dict],
    tool_results: list[dict],
) -> list[dict]:
    system_prompt = persona["system_prompt_template"].replace("{{persona_name }}", persona["name"])
    prompt_messages = [
        {"role": "system", "content": system_prompt},
        {
            "role": "system",
            "content": f"说话风格：{persona['speaking_style']}\n背景设定：{persona['background_story']}",
        },
    ]
    if summary_memory:
        prompt_messages.append(
            {
                "role": "system",
                "content": "摘要记忆：\n" + "\n".join(item["summary"] for item in summary_memory[-2:]),
            }
        )
    if long_term_memories:
        prompt_messages.append(
            {
                "role": "system",
                "content": "长期记忆：\n" + "\n".join(item["content"] for item in long_term_memories[:3]),
            }
        )
    if tool_results:
        prompt_messages.append(
            {
                "role": "system",
                "content": "工具结果：\n" + "\n".join(item["result"] for item in tool_results),
            }
        )
    prompt_messages.extend(recent_messages[-8:])
    prompt_messages.append({"role": "user", "content": user_input})
    return prompt_messages
