def _manual_request_input_text(item: dict) -> str:
    input_text = item.get("input_text")
    if input_text:
        return input_text

    input_params = item.get("input_params")
    if isinstance(input_params, dict):
        parts: list[str] = []
        used_keys: set[str] = set()
        for key in ("goal", "scope", "output", "notes"):
            value = input_params.get(key)
            if isinstance(value, str) and value.strip():
                parts.append(f"{key}: {value.strip()}")
                used_keys.add(key)
        for key, value in sorted(input_params.items()):
            if key in used_keys:
                continue
            if isinstance(value, str) and value.strip():
                parts.append(f"{key}: {value.strip()}")
        if parts:
            return "; ".join(parts)

    return ""


def build_companion_prompt(
    *,
    persona: dict,
    user_input: str,
    recent_messages: list[dict],
    summary_memory: list[dict],
    long_term_memories: list[dict],
    tool_results: list[dict],
    manual_tool_requests: list[dict] | None = None,
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
                "content": "阶段摘要记忆：\n" + "\n".join(item["summary"] for item in summary_memory[-2:]),
            }
        )

    if long_term_memories:
        prompt_messages.append(
            {
                "role": "system",
                "content": "长期记忆：\n" + "\n".join(item["content"] for item in long_term_memories[:3]),
            }
        )

    if manual_tool_requests:
        prompt_messages.append(
            {
                "role": "system",
                "content": "用户本轮明确指定了以下工具：\n"
                + "\n".join(
                    f"- {item['type']}: {item['label']}"
                    + (f"（参数：{_manual_request_input_text(item)}）" if _manual_request_input_text(item) else "")
                    for item in manual_tool_requests
                ),
            }
        )

    if tool_results:
        prompt_messages.append(
            {
                "role": "system",
                "content": "工具结果：\n"
                + "\n".join(
                    f"- {item.get('title') or item.get('name') or 'Tool'}: {item['result']}"
                    + ("（用户手动触发）" if item.get("manual") else "")
                    for item in tool_results
                ),
            }
        )

    prompt_messages.extend(recent_messages[-8:])
    prompt_messages.append({"role": "user", "content": user_input})
    return prompt_messages

