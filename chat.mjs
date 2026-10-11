const SYSTEM_PROMPT = `Você é a assistente virtual do Rede Apoio, um projeto educativo de acolhimento e orientação sobre relacionamentos abusivos e violência contra mulheres. Responda em português brasileiro, com empatia, clareza e sem julgar. Não diagnostique nem prometa confidencialidade absoluta. Não afirme que um questionário determina definitivamente o risco. Incentive a pessoa a procurar alguém de confiança e serviços locais especializados. Se houver perigo imediato no Brasil, oriente a ligar 190; para orientação e denúncias de violência contra mulheres, Ligue 180. Não pressione a pessoa a confrontar quem a ameaça. Se a pessoa for menor de idade, incentive procurar um adulto de confiança ou profissional da escola. Em emergências médicas, SAMU 192.`;

export default async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Método não permitido.' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Allow': 'POST' }
    });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'A API da OpenAI ainda não está configurada no servidor.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json; charset=utf-8' }
    });
  }

  let body;
  try { body = await req.json(); }
  catch {
    return new Response(JSON.stringify({ error: 'O pedido não contém JSON válido.' }), {
      status: 400, headers: { 'Content-Type': 'application/json; charset=utf-8' }
    });
  }

  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return new Response(JSON.stringify({ error: 'Envie ao menos uma mensagem.' }), {
      status: 400, headers: { 'Content-Type': 'application/json; charset=utf-8' }
    });
  }

  const messages = body.messages.slice(-10).filter(m =>
    m && ['user', 'assistant'].includes(m.role) && typeof m.content === 'string'
  ).map(m => ({ role: m.role, content: m.content.slice(0, 2000) }));

  if (!messages.length || messages[messages.length - 1].role !== 'user') {
    return new Response(JSON.stringify({ error: 'A última mensagem precisa ser do usuário.' }), {
      status: 400, headers: { 'Content-Type': 'application/json; charset=utf-8' }
    });
  }

  try {
    const upstream = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...messages],
        max_tokens: 500,
        temperature: 0.5
      })
    });

    const result = await upstream.json().catch(() => ({}));
    if (!upstream.ok) {
      console.error('OpenAI API error status:', upstream.status);
      const message = upstream.status === 401
        ? 'A chave da OpenAI foi recusada. Confira a variável OPENAI_API_KEY.'
        : upstream.status === 429
          ? 'A API da OpenAI atingiu um limite ou está sem créditos disponíveis. Confira o faturamento e os limites da API.'
          : 'A OpenAI não conseguiu responder agora. Tente novamente em instantes.';
      return new Response(JSON.stringify({ error: message }), {
        status: upstream.status === 429 ? 429 : 502,
        headers: { 'Content-Type': 'application/json; charset=utf-8' }
      });
    }

    const reply = result.choices?.[0]?.message?.content?.trim();
    if (!reply) throw new Error('Empty response from OpenAI');
    return new Response(JSON.stringify({ reply }), {
      status: 200,
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
    });
  } catch (error) {
    console.error('Chat function failed:', error?.message || 'unknown error');
    return new Response(JSON.stringify({ error: 'Não foi possível conectar à IA agora. Tente novamente.' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json; charset=utf-8' }
    });
  }
};
