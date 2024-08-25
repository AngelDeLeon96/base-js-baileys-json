import { join } from 'path'
import { createBot, createProvider, createFlow, addKeyword, utils, EVENTS } from '@builderbot/bot'
import { JsonFileDB as Database } from '@builderbot/database-json'
import { BaileysProvider as Provider } from '@builderbot/provider-baileys'
import { crearDetectorPalabrasOfensivas } from './utils/detector_words.js'
const PORT = process.env.PORT ?? 3008
const badWords = ['fuck', 'ass hole', 'motherfucker'];


const welcomeFlow = addKeyword(EVENTS.WELCOME)
    .addAnswer(`🙌 Escribe algo en el chat`, { capture: true }, async (ctx, { state }) => {
        await state.update({ msg: ctx.body })
    })
    .addAction(async (ctx, { state, flowDynamic, provider }) => {
        const detector = crearDetectorPalabrasOfensivas()
        const resultado = detector(state.get('msg'))
        const id = ctx.key.id
        const fromMe = ctx.key.fromMe
        const timeStamp = ctx.messageTimestamp
        const res = await provider.vendor.updateBlockStatus(ctx.key.remoteJid, "unblock") // Block user
        console.log(res)

        console.log(resultado, ctx)
        if (resultado.puntajeTotal >= 2) {
            await flowDynamic(`palabras ofensivas detectadas, su mensaje sera borrado... Si continua sera bloqueado!`)
            try {
                await provider.vendor.chatModify(
                    { clear: { messages: [{ id: id, fromMe: fromMe, timestamp: timeStamp }] } },
                    ctx.key.remoteJid
                )
                await flowDynamic(`Message deleted successfully.`)
            } catch (error) {
                console.log(`Error: ${JSON.stringify(error, null, 3)}`)
            }
        }
    })
    .addAnswer(`bye`, async (_, { endFlow }) => {
        return endFlow()
    })




const main = async () => {
    const adapterFlow = createFlow([welcomeFlow])

    const adapterProvider = createProvider(Provider, {
        experimentalStore: true,
        timeRelease: 10800000, // 3 hours in milliseconds
    })

    const adapterDB = new Database({ filename: 'db.json' })

    const { handleCtx, httpServer } = await createBot({
        flow: adapterFlow,
        provider: adapterProvider,
        database: adapterDB,
    })

    adapterProvider.server.post(
        '/v1/messages',
        handleCtx(async (bot, req, res) => {
            const { number, message, urlMedia } = req.body
            await bot.sendMessage(number, message, { media: urlMedia ?? null })
            return res.end('sended')
        })
    )

    adapterProvider.server.post(
        '/v1/register',
        handleCtx(async (bot, req, res) => {
            const { number, name } = req.body
            await bot.dispatch('REGISTER_FLOW', { from: number, name })
            return res.end('trigger')
        })
    )

    adapterProvider.server.post(
        '/v1/samples',
        handleCtx(async (bot, req, res) => {
            const { number, name } = req.body
            await bot.dispatch('SAMPLES', { from: number, name })
            return res.end('trigger')
        })
    )

    adapterProvider.server.post(
        '/v1/blacklist',
        handleCtx(async (bot, req, res) => {
            const { number, intent } = req.body
            if (intent === 'remove') bot.blacklist.remove(number)
            if (intent === 'add') bot.blacklist.add(number)

            res.writeHead(200, { 'Content-Type': 'application/json' })
            return res.end(JSON.stringify({ status: 'ok', number, intent }))
        })
    )

    httpServer(+PORT)
}

main()
