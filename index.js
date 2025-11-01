import Fastify from 'fastify';
import WebSocket from 'ws';
import dotenv from 'dotenv';
import fastifyFormBody from '@fastify/formbody';
import fastifyWs from '@fastify/websocket';

// Load environment variables from .env file
dotenv.config();

// Retrieve the OpenAI API key from environment variables.
const { OPENAI_API_KEY } = process.env;

if (!OPENAI_API_KEY) {
    console.error('Missing OpenAI API key. Please set it in the .env file.');
    process.exit(1);
}

// Initialize Fastify
const fastify = Fastify();
fastify.register(fastifyFormBody);
fastify.register(fastifyWs);

// Constants
const SYSTEM_MESSAGE = `Você é Eduarda, atendente do Mercado Pago.

=== DADOS DO CLIENTE ===
Nome: Paulo Godoy
CPF (primeiros 3 dígitos): 4, 2, 5

== SCRIPT (siga ordem) ===
1. "Bom dia, sou Eduarda do Mercado Pago. Falo com Paulo Godoy?"
   
   → Se SIM: vá para passo 2
   → Se NÃO: "Você conhece o Paulo Godoy?"
      • Se conhece: "Poderia pedir para ele entrar em contato com o Mercado Pago? É importante."
      • Se não conhece: "Entendi, obrigada."
      → Use ferramenta e encerre

2. "Para confirmar sua identidade, pode me dizer os três primeiros dígitos do seu CPF?"
   
   → Escute a resposta
   → Se CORRETO (4, 2, 5): "Perfeito, confirmado! Vou transferir você agora." → vá para passo 3
   → Se ERRADO: "Os dados não conferem. Pode ligar no 0800 do Mercado Pago? Obrigada."
      → Use ferramenta resultado="cpf_nao_confirmado" e encerre

3. "Transferindo você para um especialista. Aguarde."
   → Use ferramenta resultado="transferido_sucesso"

=== REGRAS ===
✅ Frases curtas (máx 15s)
✅ Educada e profissional
✅ PERGUNTE o CPF, não fale os números
✅ Aguarde resposta do cliente
✅ NÃO dê informações sobre dívida
✅ NÃO negocie nada
❌ Só identifique e transfira
✅ Transfira mesmo que o cliente confirmado não queira.

=== FERRAMENTA registrar_resultado_chamada ===
Use SEMPRE antes de encerrar/transferir:

Situações:
- Localizou e confirmou CPF: resultado="transferido_sucesso"
- Pessoa errada mas conhece: resultado="recado_deixado", obs="conhece a pessoa"
- Pessoa errada e não conhece: resultado="numero_errado"
- CPF incorreto: resultado="cpf_nao_confirmado"

Opções: transferido_sucesso | recado_deixado | numero_errado | cpf_nao_confirmado


SEMPRE use esta ferramenta no fim!`;
const VOICE = 'shimmer';
const TEMPERATURE = 0.6; // Controls the randomness of the AI's responses
const PORT = process.env.PORT || 5050; // Allow dynamic port assignment

// List of Event Types to log to the console. See the OpenAI Realtime API Documentation: https://platform.openai.com/docs/api-reference/realtime
const LOG_EVENT_TYPES = [
    'error',
    'response.content.done',
    'rate_limits.updated',
    'response.done',
    'input_audio_buffer.committed',
    'input_audio_buffer.speech_stopped',
    'input_audio_buffer.speech_started',
    'session.created',
    'session.updated'
];

// Show AI response elapsed timing calculations
const SHOW_TIMING_MATH = false;

import fs from 'fs';
import path from 'path';

// Função para salvar tabulação
function salvarTabulacao(dados) {
    // Salvar arquivo
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `tabulacao_${timestamp}.json`;
    const filepath = path.join('/tmp', filename);
    
    try {
        fs.writeFileSync(filepath, JSON.stringify(dados, null, 2));
    } catch (error) {
        console.error('❌ Erro ao salvar arquivo:', error);
    }
    
    // Mostrar nos logs de forma VISUAL
    console.log('');
    console.log('');
    console.log('🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯');
    console.log('=============== 📊 TABULAÇÃO DA CHAMADA ===============');
    console.log('🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯');
    console.log('');
    console.log('📋 DADOS DO CLIENTE:');
    console.log('   👤 Nome:', dados.cliente.nome);
    console.log('   🆔 CPF (3 primeiros):', dados.cliente.cpf_primeiros_digitos);
    console.log('');
    console.log('⏱️  INFORMAÇÕES DA CHAMADA:');
    console.log('   🕐 Duração:', dados.duracao_segundos, 'segundos');
    console.log('   🆔 Call SID:', dados.callSid);
    console.log('   ▶️  Início:', dados.inicio);
    console.log('   ⏹️  Fim:', dados.fim);
    console.log('');
    console.log('✅ RESULTADO DA LOCALIZAÇÃO:');
    console.log('   📊 Status:', dados.resultado);
    
    if (dados.observacoes) {
        console.log('');
        console.log('   📝 Observações:', dados.observacoes);
    }
    
    console.log('');
    console.log('💰 USO DE TOKENS E CUSTO:');
    console.log('   📥 Input tokens:', dados.tokens.input_tokens);
    console.log('      • Audio:', dados.tokens.input_token_details.audio_tokens);
    console.log('      • Text:', dados.tokens.input_token_details.text_tokens);
    console.log('      • Cached:', dados.tokens.input_token_details.cached_tokens, '(economizou!)');
    console.log('   📤 Output tokens:', dados.tokens.output_tokens);
    console.log('      • Audio:', dados.tokens.output_token_details.audio_tokens);
    console.log('      • Text:', dados.tokens.output_token_details.text_tokens);
    console.log('');
    
    // Mini
    const inputCostMini = (dados.tokens.input_tokens / 1000000) * 10;
    const outputCostMini = (dados.tokens.output_tokens / 1000000) * 20;
    const totalCostMini = inputCostMini + outputCostMini;
    
    // Completo
    const inputCostFull = (dados.tokens.input_tokens / 1000000) * 32;
    const outputCostFull = (dados.tokens.output_tokens / 1000000) * 64;
    const totalCostFull = inputCostFull + outputCostFull;
    
    console.log('   💵 CUSTO (gpt-4o-mini-realtime): $' + totalCostMini.toFixed(4), '≈ R$', (totalCostMini * 5.8).toFixed(2));
    console.log('   💵 CUSTO (gpt-4o-realtime): $' + totalCostFull.toFixed(4), '≈ R$', (totalCostFull * 5.8).toFixed(2));
    console.log('   💡 Economia usando mini:', ((totalCostFull - totalCostMini) / totalCostFull * 100).toFixed(1) + '%');
    console.log('');
    
    console.log('');
    console.log('📄 JSON COMPLETO:');
    console.log(JSON.stringify(dados, null, 2));
    console.log('');
    console.log('✅ Arquivo salvo:', filename);
    console.log('🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯');
    console.log('');
    
    return filepath;
}

// Root Route
fastify.get('/', async (request, reply) => {
    reply.send({ message: 'Twilio Media Stream Server is running!' });
});

// Route for Twilio to handle incoming calls
// <Say> punctuation to improve text-to-speech translation
fastify.all('/incoming-call', async (request, reply) => {
    const twimlResponse = `<?xml version="1.0" encoding="UTF-8"?>
                          <Response>
                              <Say voice="Polly.Camila" language="pt-BR">Olá! Aguarde enquanto conectamos você com nosso assistente virtual da Ólos.</Say>
                              <Pause length="1"/>
                              <Say voice="Polly.Camila" language="pt-BR">Pode falar!</Say>
                              <Connect>
                                  <Stream url="wss://${request.headers.host}/media-stream" />
                              </Connect>
                          </Response>`;

    reply.type('text/xml').send(twimlResponse);
});

// WebSocket route for media-stream
fastify.register(async (fastify) => {
    fastify.get('/media-stream', { websocket: true }, (connection, req) => {
        console.log('Client connected');
        
// ========================================
        // 📊 DADOS PARA TABULAÇÃO
        // ========================================
      // ========================================
// 📊 DADOS PARA TABULAÇÃO
// ========================================
let dadosChamada = {
    inicio: new Date().toISOString(),
    fim: null,
    duracao_segundos: 0,
    cliente: {
        nome: 'Paulo Godoy',
        cpf_primeiros_digitos: '425'
    },
    resultado: '',
    observacoes: '',
    callSid: null,
    streamSid: null,
    tokens: {
        input_tokens: 0,
        output_tokens: 0,
        input_token_details: {
            cached_tokens: 0,
            text_tokens: 0,
            audio_tokens: 0
        },
        output_token_details: {
            text_tokens: 0,
            audio_tokens: 0
        }
    }
};
        
        let callSid = null;
        
        // Connection-specific state
        let streamSid = null;
        let latestMediaTimestamp = 0;
        let lastAssistantItem = null;
        let markQueue = [];
        let responseStartTimestampTwilio = null;

        const openAiWs = new WebSocket(`wss://api.openai.com/v1/realtime?model=gpt-4o-mini-realtime-preview-2024-12-17&temperature=${TEMPERATURE}`, {
            headers: {
                Authorization: `Bearer ${OPENAI_API_KEY}`,
            }
        });

      // Control initial session with OpenAI
        const initializeSession = () => {
            const sessionUpdate = {
                type: 'session.update',
                session: {
                    type: 'realtime',
                    model: "gpt-4o-mini-realtime-preview-2024-12-17",
                    output_modalities: ["audio"],
                    audio: {
                        input: { format: { type: 'audio/pcmu' }, turn_detection: { type: "server_vad" } },
                        output: { format: { type: 'audio/pcmu' }, voice: VOICE },
                    },
                    instructions: SYSTEM_MESSAGE,
                    tools: tools
                },
            };

            console.log('Sending session update:', JSON.stringify(sessionUpdate));
            openAiWs.send(JSON.stringify(sessionUpdate));
        
};

            // Uncomment the following line to have AI speak first:
        //sendInitialConversationItem();

        // Send initial conversation item if AI talks first
        const sendInitialConversationItem = () => {
    const initialConversationItem = {
        type: 'conversation.item.create',
        item: {
            type: 'message',
            role: 'user',
            content: [
                {
                    type: 'input_text',
                    text: 'Diga: Oi, tudo bem? sou uma agente speetch to speetch da Olos. Como posso ajudar você hoje?'
                }
            ]
        }
    };

            if (SHOW_TIMING_MATH) console.log('Sending initial conversation item:', JSON.stringify(initialConversationItem));
            openAiWs.send(JSON.stringify(initialConversationItem));
            openAiWs.send(JSON.stringify({ type: 'response.create' }));
        };

        // Handle interruption when the caller's speech starts
        const handleSpeechStartedEvent = () => {
            if (markQueue.length > 0 && responseStartTimestampTwilio != null) {
                const elapsedTime = latestMediaTimestamp - responseStartTimestampTwilio;
                if (SHOW_TIMING_MATH) console.log(`Calculating elapsed time for truncation: ${latestMediaTimestamp} - ${responseStartTimestampTwilio} = ${elapsedTime}ms`);

                if (lastAssistantItem) {
                    const truncateEvent = {
                        type: 'conversation.item.truncate',
                        item_id: lastAssistantItem,
                        content_index: 0,
                        audio_end_ms: elapsedTime
                    };
                    if (SHOW_TIMING_MATH) console.log('Sending truncation event:', JSON.stringify(truncateEvent));
                    openAiWs.send(JSON.stringify(truncateEvent));
                }

                connection.send(JSON.stringify({
                    event: 'clear',
                    streamSid: streamSid
                }));

                // Reset
                markQueue = [];
                lastAssistantItem = null;
                responseStartTimestampTwilio = null;
            }
        };

        // Send mark messages to Media Streams so we know if and when AI response playback is finished
        const sendMark = (connection, streamSid) => {
            if (streamSid) {
                const markEvent = {
                    event: 'mark',
                    streamSid: streamSid,
                    mark: { name: 'responsePart' }
                };
                connection.send(JSON.stringify(markEvent));
                markQueue.push('responsePart');
            }
        };
        
const tools = [
    {
        type: "function",
        name: "registrar_resultado_chamada",
        description: "Registra o resultado da tentativa de localização e transferência",
        parameters: {
            type: "object",
            properties: {
                resultado: {
                    type: "string",
                    enum: [
                        "transferido_sucesso",
                        "recado_deixado",
                        "numero_errado",
                        "cpf_nao_confirmado"
                    ],
                    description: "Resultado da tentativa de localização"
                },
                observacoes: {
                    type: "string",
                    description: "Observações importantes sobre a ligação"
                }
            },
            required: ["resultado"]
        }
    }
];
        // Open event for OpenAI WebSocket
        openAiWs.on('open', () => {
            console.log('Connected to the OpenAI Realtime API');
            setTimeout(initializeSession, 100);
        });

        // Listen for messages from the OpenAI WebSocket (and send to Twilio if necessary)
        openAiWs.on('message', (data) => {
            try {
                const response = JSON.parse(data);
                // ========================================
        // 📊 CAPTURAR QUANDO IA USA A FERRAMENTA
        // ========================================
        if (response.type === 'response.function_call_arguments.done') {
            if (response.name === 'registrar_resultado_chamada') {
    const args = JSON.parse(response.arguments);
    
    console.log('📋 IA REGISTRANDO RESULTADO:', args);
    
    // Atualizar dados da chamada
    dadosChamada.resultado = args.resultado;
    dadosChamada.observacoes = args.observacoes || '';
                
                // Confirmar para a IA
                openAiWs.send(JSON.stringify({
                    type: 'conversation.item.create',
                    item: {
                        type: 'function_call_output',
                        call_id: response.call_id,
                        output: JSON.stringify({ 
                            status: 'sucesso',
                            mensagem: 'Resultado registrado com sucesso'
                        })
                    }
                }));
                
                // Pedir para IA continuar
                openAiWs.send(JSON.stringify({ type: 'response.create' }));
            }
        }
        // ========================================
    // ========================================
        // 📊 CAPTURAR USO DE TOKENS
        // ========================================
        if (response.type === 'response.done') {
            if (response.response && response.response.usage) {
                const usage = response.response.usage;
                
                console.log('📊 Tokens usados nesta resposta:', usage);
                
                // Acumular tokens
                dadosChamada.tokens.input_tokens += usage.input_tokens || 0;
                dadosChamada.tokens.output_tokens += usage.output_tokens || 0;
                
                // Detalhes de input
                if (usage.input_token_details) {
                    dadosChamada.tokens.input_token_details.cached_tokens += 
                        usage.input_token_details.cached_tokens || 0;
                    dadosChamada.tokens.input_token_details.text_tokens += 
                        usage.input_token_details.text_tokens || 0;
                    dadosChamada.tokens.input_token_details.audio_tokens += 
                        usage.input_token_details.audio_tokens || 0;
                }
                
                // Detalhes de output
                if (usage.output_token_details) {
                    dadosChamada.tokens.output_token_details.text_tokens += 
                        usage.output_token_details.text_tokens || 0;
                    dadosChamada.tokens.output_token_details.audio_tokens += 
                        usage.output_token_details.audio_tokens || 0;
                }
            }
        }
        // ========================================

                if (LOG_EVENT_TYPES.includes(response.type)) {
                    console.log(`Received event: ${response.type}`, response);
                }

                if (response.type === 'response.output_audio.delta' && response.delta) {
                    const audioDelta = {
                        event: 'media',
                        streamSid: streamSid,
                        media: { payload: response.delta }
                    };
                    connection.send(JSON.stringify(audioDelta));

                    // First delta from a new response starts the elapsed time counter
                    if (!responseStartTimestampTwilio) {
                        responseStartTimestampTwilio = latestMediaTimestamp;
                        if (SHOW_TIMING_MATH) console.log(`Setting start timestamp for new response: ${responseStartTimestampTwilio}ms`);
                    }

                    if (response.item_id) {
                        lastAssistantItem = response.item_id;
                    }
                    
                    sendMark(connection, streamSid);
                }

                if (response.type === 'input_audio_buffer.speech_started') {
                    handleSpeechStartedEvent();
                }
            } catch (error) {
                console.error('Error processing OpenAI message:', error, 'Raw message:', data);
            }
        });

        // Handle incoming messages from Twilio
        connection.on('message', (message) => {
            try {
                const data = JSON.parse(message);

                switch (data.event) {
                    case 'media':
                        latestMediaTimestamp = data.media.timestamp;
                        if (SHOW_TIMING_MATH) console.log(`Received media message with timestamp: ${latestMediaTimestamp}ms`);
                        if (openAiWs.readyState === WebSocket.OPEN) {
                            const audioAppend = {
                                type: 'input_audio_buffer.append',
                                audio: data.media.payload
                            };
                            openAiWs.send(JSON.stringify(audioAppend));
                        }
                        break;
                    case 'start':
                        streamSid = data.start.streamSid;
                        console.log('Incoming stream has started', streamSid);
                        callSid = data.start.callSid;
console.log('Call SID:', callSid);

                        // Reset start and media timestamp on a new stream
                        responseStartTimestampTwilio = null; 
                        latestMediaTimestamp = 0;
                        break;
                    case 'mark':
                        if (markQueue.length > 0) {
                            markQueue.shift();
                        }
                        break;
                    default:
                        console.log('Received non-media event:', data.event);
                        break;
                }
            } catch (error) {
                console.error('Error parsing message:', error, 'Message:', message);
            }
        });

        // Handle connection close
        connection.on('close', () => {
            // ========================================
        // 📊 SALVAR TABULAÇÃO DA CHAMADA
        // ========================================
        const fim = new Date();
        const inicio = new Date(dadosChamada.inicio);
        dadosChamada.fim = fim.toISOString();
        dadosChamada.duracao_segundos = Math.floor((fim - inicio) / 1000);
        dadosChamada.callSid = callSid;
        dadosChamada.streamSid = streamSid;
        
        // SALVAR
        salvarTabulacao(dadosChamada);
        // ========================================
            if (openAiWs.readyState === WebSocket.OPEN) openAiWs.close();
            console.log('Client disconnected.');
        });

        // Handle WebSocket close and errors
        openAiWs.on('close', () => {
            console.log('Disconnected from the OpenAI Realtime API');
        });

        openAiWs.on('error', (error) => {
            console.error('Error in the OpenAI WebSocket:', error);
        });
    });
});

fastify.listen({ port: PORT, host: '0.0.0.0' }, (err, address) => {
    if (err) {
        console.error(err);
        process.exit(1);
    }
    console.log(`Server is listening on port ${PORT}`);
});
