import {
  GatewayIntentBits,
  ClientEvents,
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  CacheType,
  ApplicationCommandType,
  ContextMenuCommandBuilder,
  UserContextMenuCommandInteraction,
  MessageContextMenuCommandInteraction,
  Client
} from 'discord.js'
import { CommandHandlersOrOnRun, IModule } from './module_types'
import shortid from 'shortid'

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
      handler: (...args: any) => any
    }
  } = {}
  slashCommands: { [id: string]: SlashCommandBuilder } = {}
  contextMenuCommands: { [id: string]: ContextMenuCommandBuilder } = {}

  constructor (
    public readonly id: string,
    public readonly intents: GatewayIntentBits[],
    public client: Client<true>
  ) {}

  when<K extends keyof ClientEvents> (
    event: K | K[],
    handler: (...args: ClientEvents[K]) => any
  ): HandlerID {
    const events = Array.isArray(event) ? event : [event]
    for (const evt of events) {
      this.client.on(evt, handler)
    }
    const id = this.generateId('when')
    this.eventHandlers[id] = { events, handler }
    return new HandlerID(id)
  }

  once<K extends keyof ClientEvents> (
    event: K | K[],
    handler: (...args: ClientEvents[K]) => any
  ): HandlerID {
    const events = Array.isArray(event) ? event : [event]
    for (const evt of events) {
      this.client.once(evt, handler)
    }
    const id = this.generateId('once')
    this.eventHandlers[id] = { events, handler }
    return new HandlerID(id)
  }

  slash<T> (
    command: string,
    description: string,
    handlers: CommandHandlersOrOnRun<
      SlashCommandBuilder,
      ChatInputCommandInteraction<CacheType>,
      T
    >
  ): HandlerID {
    const id = `${this.id}: /${command}`
    let builder = new SlashCommandBuilder()
      .setName(command)
      .setDescription(description)

    if (!(handlers instanceof Function)) {
      if (handlers.build) builder = handlers.build(builder)
    }
    this.slashCommands[id] = builder
    return new HandlerID(id)
  }

  menu<
    T,
    I extends ApplicationCommandType.User | ApplicationCommandType.Message
  > (
    label: string,
    type: I,
    handlers: CommandHandlersOrOnRun<
      ContextMenuCommandBuilder,
      I extends ApplicationCommandType.User
        ? UserContextMenuCommandInteraction<CacheType>
        : MessageContextMenuCommandInteraction<CacheType>,
      T
    >
  ): HandlerID {
    throw new Error('Method not implemented.')
  }
  remove (handler: HandlerID): boolean {
    throw new Error('Method not implemented.')
  }

  private generateId (source: string): string {
    return `${this.id}: ${source} #${shortid()}`
  }
}
