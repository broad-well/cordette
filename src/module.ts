import {
  ApplicationCommandType,
  ChatInputCommandInteraction,
  Client,
  ClientEvents,
  CommandInteraction,
  ContextMenuCommandBuilder,
  Events,
  GatewayIntentBits,
  Interaction,
  MessageContextMenuCommandInteraction,
  SlashCommandBuilder,
  UserContextMenuCommandInteraction
} from 'discord.js'
import {
  CommandConfig,
  CommandConfigOrOnRun,
  IModule
} from './module_types'
import shortid from 'shortid'
import { stripMarkdownTag } from './utils'

/**
 * A tagged type wrapping a string that uniquely identifies a handler.
 */
export class HandlerID {
  constructor (public readonly id: string) {}
}

export class Module implements IModule<HandlerID> {
  eventHandlers: {
    [id: string]: {
      events: Array<keyof ClientEvents>
      once: boolean
      handler: (...args: any) => any
    }
  } = {}

  slashCommands: {
    [id: string]: {
      guild?: string
      builder: Pick<SlashCommandBuilder, 'toJSON' | 'name'>
      handler: (...args: any) => any
    }
  } = {}

  contextMenuCommands: {
    [id: string]: {
      guild?: string
      builder: Pick<ContextMenuCommandBuilder, 'toJSON' | 'name'>
      handler: (...args: any) => any
    }
  } = {}

  constructor (
    public readonly id: string,
    public readonly intents: GatewayIntentBits[],
    public client: Client
  ) {}

  when<K extends keyof ClientEvents> (
    event: K | K[],
    handler: (...args: ClientEvents[K]) => any
  ): HandlerID {
    return this.handler(event, handler, false)
  }

  once<K extends keyof ClientEvents> (
    event: K | K[],
    handler: (...args: ClientEvents[K]) => any
  ): HandlerID {
    return this.handler(event, handler, true)
  }

  private handler<K extends keyof ClientEvents> (
    event: K | K[],
    handler: (...args: ClientEvents[K]) => any,
    once: boolean
  ): HandlerID {
    const events = Array.isArray(event) ? event : [event]
    const id = this.generateId(once ? 'once' : 'when')
    this.eventHandlers[id] = { events, once, handler }
    return new HandlerID(id)
  }

  slash<T> (
    command: string,
    description: string,
    configOrOnRun: CommandConfigOrOnRun<
    SlashCommandBuilder,
    ChatInputCommandInteraction,
    T
    >
  ): HandlerID {
    const id = `${this.id}: /${command}`
    const builder = new SlashCommandBuilder()
      .setName(command)
      .setDescription(description)

    const config =
      configOrOnRun instanceof Function
        ? {
            run: configOrOnRun
          }
        : configOrOnRun

    const finalBuilder = config.build !== undefined ? config.build(builder) : builder
    const handler = this.slashHandler(command, id, config)
    this.slashCommands[id] = { guild: config.guild, builder: finalBuilder, handler }

    return new HandlerID(id)
  }

  private slashHandler<T> (
    name: string,
    id: string,
    config: CommandConfig<any, ChatInputCommandInteraction, T>
  ) {
    return async (intx: Interaction) => {
      if (intx.isChatInputCommand() && intx.commandName === name) {
        await this.checkThenRun(intx, id, config)
      }
    }
  }

  private userContextMenuHandler<T> (
    name: string,
    id: string,
    config: CommandConfig<any, UserContextMenuCommandInteraction, T>
  ) {
    return async (intx: Interaction) => {
      if (intx.isUserContextMenuCommand() && intx.commandName === name) {
        await this.checkThenRun(intx, id, config)
      }
    }
  }

  private messageContextMenuHandler<T> (
    name: string,
    id: string,
    config: CommandConfig<any, MessageContextMenuCommandInteraction, T>
  ) {
    return async (intx: Interaction) => {
      if (intx.isMessageContextMenuCommand() && intx.commandName === name) {
        await this.checkThenRun(intx, id, config)
      }
    }
  }

  private async checkThenRun<I extends CommandInteraction, T> (
    intx: I,
    id: string,
    { guild, check, run }: CommandConfig<any, I, T>
  ): Promise<void> {
    if (guild !== undefined && intx.guildId !== guild) return
    let resolved: T | undefined
    try {
      resolved = check instanceof Function ? await check(intx) : undefined
    } catch (checkFail: any) {
      const content =
        checkFail instanceof Error ? checkFail.message : checkFail.toString()
      await intx.reply({
        content,
        ephemeral: true
      })
      return
    }
    try {
      const result = await run(intx, resolved)
      if (result !== null && result !== undefined) {
        if (typeof result === 'string') {
          await intx.reply({ content: result, ephemeral: true })
        } else {
          await intx.reply(result)
        }
      }
    } catch (err: any) {
      try {
        console.info(`${id} failed`)
        console.error(err)
        const content = stripMarkdownTag`❗ There was an error.\`\`\`${err instanceof Error ? err.message : err.toString()}\`\`\``
        if (intx.replied) {
          await intx.followUp({ content, ephemeral: true })
        } else {
          await intx.reply({ content, ephemeral: true })
        }
      } catch (err2: any) {
        console.error('Catastrophic failure trying to react to error', err)
        console.error(err2)
      }
    }
  }

  menu<
    T,
    I extends ApplicationCommandType.User | ApplicationCommandType.Message
  > (
    label: string,
    type: I,
    configOrOnRun: CommandConfigOrOnRun<
    ContextMenuCommandBuilder,
    I extends ApplicationCommandType.User
      ? UserContextMenuCommandInteraction
      : MessageContextMenuCommandInteraction,
    T
    >
  ): HandlerID {
    const id = `${this.id}: ContextMenu ${JSON.stringify(label)}`
    const builder = new ContextMenuCommandBuilder().setName(label).setType(type)
    const config =
      configOrOnRun instanceof Function
        ? { run: configOrOnRun }
        : configOrOnRun

    const finalBuilder = config.build != null ? config.build(builder) : builder
    const eventHandler =
      type === ApplicationCommandType.Message
        ? this.messageContextMenuHandler(
          label, id, config as CommandConfig<ContextMenuCommandBuilder, MessageContextMenuCommandInteraction, T>
        )
        : this.userContextMenuHandler(
          label, id, config as CommandConfig<ContextMenuCommandBuilder, UserContextMenuCommandInteraction, T>
        )

    this.contextMenuCommands[id] = { guild: config.guild, builder: finalBuilder, handler: eventHandler }
    return new HandlerID(id)
  }

  remove (handler: HandlerID): boolean {
    const eventHandler = this.eventHandlers[handler.id]
    if (eventHandler !== undefined) {
      for (const evt of eventHandler.events) {
        this.client.removeListener(evt, eventHandler.handler)
      }
      return true
    }
    const command =
      this.slashCommands[handler.id] ?? this.contextMenuCommands[handler.id]
    if (command !== undefined) {
      this.client.removeListener(Events.InteractionCreate, command.handler)
      return true
    }
    return false
  }

  applyToClient (): void {
    for (const { events, once, handler } of Object.values(this.eventHandlers)) {
      for (const evt of events) {
        if (once) {
          this.client.once(evt, handler)
        } else {
          this.client.on(evt, handler)
        }
      }
    }
    for (const { handler } of [
      ...Object.values(this.slashCommands),
      ...Object.values(this.contextMenuCommands)
    ]) {
      this.client.on(Events.InteractionCreate, handler)
    }
  }

  clearFromClient (): void {
    for (const { events, handler } of Object.values(this.eventHandlers)) {
      for (const evt of events) {
        this.client.removeListener(evt, handler)
      }
    }
    for (const { handler } of [
      ...Object.values(this.slashCommands),
      ...Object.values(this.contextMenuCommands)
    ]) {
      this.client.removeListener(Events.InteractionCreate, handler)
    }
  }

  private generateId (source: string): string {
    return `${this.id}: ${source} #${shortid()}`
  }
}
