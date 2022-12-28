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
  CommandHandlers,
  CommandHandlersOrOnRun,
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
      events: (keyof ClientEvents)[]
      once: boolean
      handler: (...args: any) => any
    }
  } = {}
  slashCommands: {
    [id: string]: [builder: SlashCommandBuilder, handler: (...args: any) => any]
  } = {}
  contextMenuCommands: {
    [id: string]: [
      builder: ContextMenuCommandBuilder,
      handler: (...args: any) => any
    ]
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
    handlersOrOnRun: CommandHandlersOrOnRun<
      SlashCommandBuilder,
      ChatInputCommandInteraction,
      T
    >
  ): HandlerID {
    const id = `${this.id}: /${command}`
    let builder = new SlashCommandBuilder()
      .setName(command)
      .setDescription(description)

    const handlers =
      handlersOrOnRun instanceof Function
        ? {
            run: handlersOrOnRun
          }
        : handlersOrOnRun

    if (handlers.build) builder = handlers.build(builder)
    const handler = this.slashHandler(command, id, handlers)
    this.slashCommands[id] = [builder, handler]

    return new HandlerID(id)
  }

  private slashHandler<T> (
    name: string,
    id: string,
    handlers: CommandHandlers<any, ChatInputCommandInteraction, T>
  ) {
    return async (intx: Interaction) => {
      if (intx.isChatInputCommand() && intx.commandName === name) {
        await this.checkThenRun(intx, id, handlers)
      }
    }
  }

  private userContextMenuHandler<T> (
    name: string,
    id: string,
    handlers: CommandHandlers<any, UserContextMenuCommandInteraction, T>
  ) {
    return async (intx: Interaction) => {
      if (intx.isUserContextMenuCommand() && intx.commandName === name) {
        await this.checkThenRun(intx, id, handlers)
      }
    }
  }

  private messageContextMenuHandler<T> (
    name: string,
    id: string,
    handlers: CommandHandlers<any, MessageContextMenuCommandInteraction, T>
  ) {
    return async (intx: Interaction) => {
      if (intx.isMessageContextMenuCommand() && intx.commandName === name) {
        await this.checkThenRun(intx, id, handlers)
      }
    }
  }

  private async checkThenRun<I extends CommandInteraction, T> (
    intx: I,
    id: string,
    { check, run }: CommandHandlers<any, I, T>
  ) {
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
      if (result !== null) {
        await intx.reply({
          content: result,
          ephemeral: true
        })
      }
    } catch (err: any) {
      console.info(`${id} failed`)
      console.error(err)
      const content = err instanceof Error ? err.message : err.toString()
      await intx.reply({
        content: stripMarkdownTag`❗ There was an error.\`\`\`${content}\`\`\``,
        ephemeral: true
      })
    }
  }

  menu<
    T,
    I extends ApplicationCommandType.User | ApplicationCommandType.Message
  > (
    label: string,
    type: I,
    handlersOrOnRun: CommandHandlersOrOnRun<
      ContextMenuCommandBuilder,
      I extends ApplicationCommandType.User
        ? UserContextMenuCommandInteraction
        : MessageContextMenuCommandInteraction,
      T
    >
  ): HandlerID {
    const id = `${this.id}: ContextMenu ${JSON.stringify(label)}`
    let builder = new ContextMenuCommandBuilder().setName(label).setType(type)
    const handlers =
      handlersOrOnRun instanceof Function
        ? { run: handlersOrOnRun }
        : handlersOrOnRun

    if (handlers.build) builder = handlers.build(builder)
    const eventHandler =
      type === ApplicationCommandType.Message
        ? this.messageContextMenuHandler(
            label,
            id,
            handlers as CommandHandlers<
              ContextMenuCommandBuilder,
              MessageContextMenuCommandInteraction,
              T
            >
          )
        : this.userContextMenuHandler(
            label,
            id,
            handlers as CommandHandlers<
              ContextMenuCommandBuilder,
              UserContextMenuCommandInteraction,
              T
            >
          )

    this.contextMenuCommands[id] = [builder, eventHandler]
    return new HandlerID(id)
  }

  remove (handler: HandlerID): boolean {
    const eventHandler = this.eventHandlers[handler.id]
    if (eventHandler) {
      for (const evt of eventHandler.events) {
        this.client.removeListener(evt, eventHandler.handler)
      }
      return true
    }
    const command =
      this.slashCommands[handler.id] ?? this.contextMenuCommands[handler.id]
    if (command) {
      this.client.removeListener(Events.InteractionCreate, command[1])
      return true
    }
    return false
  }

  applyToClient () {
    for (const { events, once, handler } of Object.values(this.eventHandlers)) {
      for (const evt of events) {
        if (once) {
          this.client.once(evt, handler)
        } else {
          this.client.on(evt, handler)
        }
      }
    }
    for (const [_, handler] of [
      ...Object.values(this.slashCommands),
      ...Object.values(this.contextMenuCommands)
    ]) {
      this.client.on(Events.InteractionCreate, handler)
    }
  }

  clearFromClient () {
    for (const { events, handler } of Object.values(this.eventHandlers)) {
      for (const evt of events) {
        this.client.removeListener(evt, handler)
      }
    }
    for (const [_, handler] of [
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
