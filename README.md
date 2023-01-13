# Cordette

_Write Discord bots in style_

Cordette is a small wrapper around Discord.js that makes creating Discord bots feel more intuitive and less cumbersome. It is designed to support the [Living ArtsEngine OpenBot](https://gitlab.umich.edu/living-artsengineers/open-bot), a collaborative and modular Discord bot that everyone in [Living ArtsEngine](https://livingartsengine.engin.umich.edu) can contribute to. It simplifies the following features:
 - Slash commands
 - Context menu commands
 - Modularity: an intermediate level of organization that groups commands and listeners and enables them to be unloaded and loaded while the bot is running

## Example

```ts
import { GatewayIntentBits, Events } from 'discord.js'
import { ModuleHost } from 'cordette'
import secret from './secret'

const host = new ModuleHost(secret.token, secret.clientId)

const mod = host.module('Pong', [GatewayIntentBits.GuildMessages, GatewayIntentBits.Guilds])

mod.when(Events.MessageCreate, async msg => {
  if (msg.content.toLowerCase().trim() === 'ping!!') {
    await msg.reply('pong!!')
  }
})

host.commitStaged()
  .then(() => host.start())
  .then(() => console.log('started'))
  .catch(console.error)
```