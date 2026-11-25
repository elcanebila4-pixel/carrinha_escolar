import { createInterface, emitKeypressEvents } from 'node:readline'
import { createAccount } from './auth-server.js'

function ask(prompt, hidden = false) {
  return new Promise((resolve, reject) => {
    const input = process.stdin
    const output = process.stdout
    const wasRaw = input.isTTY && input.isRaw
    let value = ''

    output.write(prompt)
    if (input.isTTY) {
      emitKeypressEvents(input)
      input.setRawMode(true)
      input.resume()
      const onKeypress = (character, key = {}) => {
        if (key.ctrl && key.name === 'c') {
          input.off('keypress', onKeypress)
          input.setRawMode(Boolean(wasRaw))
          reject(new Error('Operação cancelada.'))
          return
        }
        if (key.name === 'return' || key.name === 'enter') {
          input.off('keypress', onKeypress)
          input.setRawMode(Boolean(wasRaw))
          output.write('\n')
          resolve(value)
          return
        }
        if (key.name === 'backspace') {
          value = value.slice(0, -1)
          output.write('\b \b')
          return
        }
        if (!key.ctrl && !key.meta && character) {
          value += character
          output.write(hidden ? '*' : character)
        }
      }
      input.on('keypress', onKeypress)
      return
    }

    const reader = createInterface({ input, output })
    reader.question('', (answer) => {
      reader.close()
      resolve(answer)
    })
  })
}

try {
  const email = await ask('E-mail do administrador: ')
  const password = await ask('Palavra-passe (mínimo 10 caracteres): ', true)
  const confirmation = await ask('Confirme a palavra-passe: ', true)
  if (password !== confirmation) throw new Error('As palavras-passe não coincidem.')
  await createAccount(email, password)
  console.log('Conta criada com sucesso.')
} catch (error) {
  console.error(error.message)
  process.exitCode = 1
}
