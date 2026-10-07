let count=0
export function requests(){return count}
export function apply(ctx){ctx.on('llm/stream',async function*(request,next){count++;yield* next()})}
