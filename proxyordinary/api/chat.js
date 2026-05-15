export default async function handler(req, res) {
    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    
    const { model, messages, systemPrompt } = req.body;
    
    try {
        let answer;
        
        if (model === 'epic') {
            answer = await fetchNoteGPT(messages);
        } else if (model === 'legend') {
            answer = await fetchOverChat(messages, systemPrompt);
        } else if (model === 'mythic') {
            answer = await fetchUnlimitedAI(messages, systemPrompt);
        } else {
            return res.status(400).json({ error: 'Model tidak dikenal' });
        }
        
        res.status(200).json({ answer });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
}

async function fetchNoteGPT(messages) {
    const lastMessage = messages.filter(m => m.role === 'user').pop();
    
    const historyPairs = [];
    for (let i = 0; i < messages.length - 1; i += 2) {
        if (messages[i]?.role === 'user' && messages[i+1]?.role === 'assistant') {
            historyPairs.push({ user: messages[i].content, assistant: messages[i+1].content });
        }
    }
    
    const payload = {
        message: lastMessage.content,
        language: "auto",
        model: "gemini-3.1-flash-lite-preview",
        tone: "default",
        length: "moderate",
        conversation_id: generateUUID(),
        image_urls: [],
        history_messages: historyPairs.slice(-5).flatMap(item => [
            { role: "user", content: item.user },
            { role: "assistant", content: item.assistant }
        ]),
        chat_mode: "standard"
    };
    
    const response = await fetch('https://notegpt.io/api/v2/chat/stream', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36',
            'Cookie': makeNoteGPTCookie(),
            'Origin': 'https://notegpt.io',
            'Referer': 'https://notegpt.io/ai-chat'
        },
        body: JSON.stringify(payload)
    });
    
    const text = await response.text();
    return parseSSE(text);
}

async function fetchOverChat(messages, systemPrompt) {
    const lastMessage = messages.filter(m => m.role === 'user').pop();
    const deviceId = generateUUID();
    const chatId = generateUUID();
    
    const systemMsg = {
        id: generateUUID(),
        role: "system",
        content: systemPrompt || "Ikuti bahasa user dan jawab dengan gaya natural."
    };
    
    const userMsg = {
        id: generateUUID(),
        role: "user",
        content: lastMessage.content
    };
    
    const historyMessages = messages.slice(-10).map(m => ({
        role: m.role === 'user' ? 'user' : 'assistant',
        content: m.content
    }));
    
    const body = {
        chatId: chatId,
        model: "openai/gpt-4o",
        messages: [...historyMessages, userMsg, systemMsg],
        personaId: "gpt-4o-landing",
        frequency_penalty: 0,
        max_tokens: 4000,
        presence_penalty: 0,
        stream: true,
        temperature: 0.7,
        top_p: 0.95
    };
    
    const response = await fetch('https://api.overchat.ai/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-device-uuid': deviceId,
            'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36',
            'Origin': 'https://overchat.ai',
            'Referer': 'https://overchat.ai/'
        },
        body: JSON.stringify(body)
    });
    
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "", answer = "";
    
    while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        
        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith("data:")) continue;
            const data = trimmed.slice(5).trim();
            if (!data || data === "[DONE]") continue;
            try {
                const json = JSON.parse(data);
                const content = json.choices?.[0]?.delta?.content;
                if (content) answer += content;
            } catch {}
        }
    }
    
    return answer || "OverChat sedang sibuk.";
}

async function fetchUnlimitedAI(messages, systemPrompt) {
    const lastMessage = messages.filter(m => m.role === 'user').pop();
    const deviceId = generateUUID();
    const chatId = generateUUID();
    
    const indonesianPrompt = `Kamu wajib menjawab hanya dalam bahasa Indonesia. ${systemPrompt || ''}\n\nPertanyaan: ${lastMessage.content}`;
    
    const body = {
        chatId: chatId,
        messages: [
            { id: generateUUID(), role: "user", content: indonesianPrompt, parts: [{ type: "text", text: indonesianPrompt }], createdAt: new Date().toISOString() },
            { id: generateUUID(), role: "assistant", content: "", parts: [{ type: "text", text: "" }], createdAt: new Date().toISOString() }
        ],
        selectedChatModel: "chat-model-reasoning",
        selectedCharacter: null,
        selectedStory: null,
        deviceId: deviceId,
        locale: "id"
    };
    
    const response = await fetch('https://app.unlimitedai.chat/api/chat', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36',
            'Cookie': `NEXT_LOCALE=id; u_device_id=${deviceId}; home_chat_id=${chatId}`,
            'Origin': 'https://app.unlimitedai.chat',
            'Referer': 'https://app.unlimitedai.chat/id'
        },
        body: JSON.stringify(body)
    });
    
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "", answer = "";
    
    while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        
        for (const line of lines) {
            if (!line.trim()) continue;
            try {
                const json = JSON.parse(line);
                if (json.type === "delta" && typeof json.delta === "string") {
                    answer += json.delta;
                }
            } catch {}
        }
    }
    
    return answer || "UnlimitedAI sedang sibuk.";
}

function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

function randomNumber(length = 10) {
    let result = "";
    for (let i = 0; i < length; i++) result += Math.floor(Math.random() * 10);
    return result;
}

function makeSboxGuid() {
    const now = Math.floor(Date.now() / 1000);
    const raw = `${now}|13|${randomNumber(9)}`;
    return Buffer.from(raw).toString("base64");
}

function makeNoteGPTCookie() {
    const now = Math.floor(Date.now() / 1000);
    const anonymousUserId = generateUUID();
    return `sbox-guid=${encodeURIComponent(makeSboxGuid())}; anonymous_user_id=${anonymousUserId}; _gid=GA1.2.${randomNumber(9)}.${now}; _ga=GA1.2.${randomNumber(9)}.${now}`;
}

function parseSSE(rawBody) {
    let result = "";
    const lines = rawBody.split(/\r?\n/);
    for (const line of lines) {
        const clean = line.trim();
        if (!clean.startsWith("data:")) continue;
        const raw = clean.replace(/^data:\s*/, "").trim();
        if (!raw || raw === "[DONE]") continue;
        try {
            const json = JSON.parse(raw);
            if (json.text) result += json.text;
            if (json.done) break;
        } catch {}
    }
    return result || "Maaf, API sedang sibuk.";
}
