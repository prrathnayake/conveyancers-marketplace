import type { AiChatMessage, AiChatPersona } from './aiChat'

const sanitize = (value: string): string => value.replace(/\s+/g, ' ').trim()

const assistantPrompts: { test: RegExp; response: (question: string) => string }[] = [
  {
    test: /(price|cost|fee|quote)/i,
    response: () =>
      'Our conveyancing packages are tailored to the property type and state. Most residential matters settle between $1,200 and $1,650 including disbursements. Share the property location and we will confirm a fixed proposal.',
  },
  {
    test: /(timeline|how long|settle|settlement)/i,
    response: () =>
      'Standard settlements finalise in six weeks. We can accelerate contract reviews within two business days and keep you updated at every milestone.',
  },
  {
    test: /(commercial|developer|project)/i,
    response: () =>
      'Our specialist team handles multi-lot developments and complex commercial transactions with dedicated project managers and automated reporting dashboards.',
  },
  {
    test: /(contact|call|speak|human)/i,
    response: () =>
      'Happy to connect you with a licensed conveyancer. Let me know your availability and preferred channel so I can queue the handover for our live team.',
  },
]

const assistantFallback =
  'Thanks for the question! I can help with pricing, timelines, onboarding, and compliance preparation. Share a few details about your matter and I will guide you through the next steps.'

const catFallback =
  'Meow! I am the Conveyancing Cat. Tell me about your property plans and I will purr with the right guidance (and escalate to the humans if you need).' 

const playfulCatResponses: { test: RegExp; response: string }[] = [
  {
    test: /(hello|hi|hey)/i,
    response: 'Purr! Hello there. Ready to chase the perfect settlement together? 🐾',
  },
  {
    test: /(stress|worried|anxious)/i,
    response: 'Deep breath—stretch those paws. I will help untangle the paperwork yarn for you.',
  },
  {
    test: /(thanks|thank you|great)/i,
    response: 'Always happy to help! I will be here grooming the compliance checklist if you need anything else.',
  },
]

const lastUserMessage = (messages: AiChatMessage[]): string => {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const entry = messages[index]
    if (entry.role === 'user') {
      return entry.content
    }
  }
  return ''
}

export const initialMessageForPersona = (persona: AiChatPersona): string => {
  if (persona === 'cat') {
    return '🐱 Hi! I am the Conveyancing Cat. Ask me about buying, selling, or timelines and I will fetch answers.'
  }
  return 'Welcome! I am your conveyancing assistant. Share your property goals and I will prepare the ideal next steps.'
}

export const generateAssistantReply = (
  persona: AiChatPersona,
  messages: AiChatMessage[],
): string => {
  const question = sanitize(lastUserMessage(messages))
  if (!question) {
    return persona === 'cat'
      ? 'Tell me what you are planning and I will nudge you towards the best conveyancing pathway.'
      : assistantFallback
  }

  if (persona === 'cat') {
    const playful = playfulCatResponses.find((entry) => entry.test.test(question))
    if (playful) {
      return playful.response
    }
    return `${catFallback} You mentioned: "${question}". I will have a conveyancer review this shortly.`
  }

  const prompt = assistantPrompts.find((entry) => entry.test.test(question))
  if (prompt) {
    return prompt.response(question)
  }
  return `${assistantFallback} You mentioned: "${question}". I will capture this for the team.`
}
