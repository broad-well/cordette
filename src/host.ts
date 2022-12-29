import { Client, GatewayIntentBits, RESTPostAPIApplicationCommandsJSONBody, Routes, Events, IntentsBitField } from 'discord.js'
import { HandlerID, Module } from './module'
import { IModule } from './module_types'

export interface IModuleHost<ID> {
  /**
   * Register a new module or replace an existing module with the given ID.
   * @param id A unique identifier for this module.
   * @param intents Intents needed by this module.
   *    Intents communicate what Discord needs to notify your bot about.
   */
  module: (id: string, intents?: GatewayIntentBits[]) => IModule<ID>
  /**
   * Unregister the given module from this host.
   * @param module The module to unregister from this host.
   */
  remove: (module: IModule<ID>) => Promise<void>
}

interface CommandID { guild?: string, id: string }

// exported for testing only
export function commandDiff (beforeOrNull: Pick<Module, 'slashCommands' | 'contextMenuCommands'> | null,
  after: Pick<Module, 'slashCommands' | 'contextMenuCommands'>):
  { remove: CommandID[], upsert: CommandID[] } {
  const before = beforeOrNull === null ? { slashCommands: {}, contextMenuCommands: {} } : beforeOrNull

  function summarize (registry: typeof before): CommandID[] {
    return [...Object.values(registry.slashCommands), ...Object.values(registry.contextMenuCommands)]
      .map(cmd => ({ guild: cmd.guild, id: cmd.builder.name }))
  }
  function equal (a: CommandID, b: CommandID): boolean {
    return a.id === b.id && a.guild === b.guild
  }

  const beforeSumm = summarize(before)
  const afterSumm = summarize(after)
  return {
    remove: beforeSumm.filter(old => !afterSumm.some(_new => equal(old, _new))),
    upsert: afterSumm
  }
}

export class ModuleHost implements IModuleHost<HandlerID> {
  modules: { [id: string]: Module } = {}
  stagedModules: { [id: string]: Module } = {}
  client: Client

  constructor (private readonly token: string, private readonly clientId: string) {
    this.client = new Client({
      intents: [
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.Guilds,
        GatewayIntentBits.MessageContent
      ]
    })
    this.client.rest.setToken(this.token)

    this.client.on('interactionCreate', x => console.log(x.toJSON()))
  }

  async remove (module: IModule<HandlerID>): Promise<void> {
    if (!(module.id in this.modules)) {
      throw new Error('We can\'t unregister a module that isn\'t registered')
    }
    const mod = this.modules[module.id]
    if (module !== mod) {
      throw new Error(`The registered module with ID ${JSON.stringify(module.id)} is different from the given module despite having the same ID`)
    }

    mod.clearFromClient()
    await Promise.all([...Object.values(mod.slashCommands), ...Object.values(mod.contextMenuCommands)].map(async cmd =>
      await this.deleteAppCommand(cmd.builder.name, cmd.guild)))
    delete this.modules[module.id]
    this.client.options.intents = new IntentsBitField(Object.values(this.modules).flatMap(m => m.intents))
  }

  module (id: string, intents: GatewayIntentBits[] = []): IModule<HandlerID> {
    this.stagedModules[id] = new Module(id, intents, this.client)
    return this.stagedModules[id]
  }

  async commitStaged (): Promise<void> {
    for (const newId of Object.keys(this.stagedModules)) {
      let before: Module | null = null
      const after = this.stagedModules[newId]

      // Listeners
      if (newId in this.modules) {
        before = this.modules[newId]
        before.clearFromClient()
      }
      after.applyToClient()

      // REST-registered commands
      const { remove } = commandDiff(before, after)
      await Promise.all(remove.map(async ({ id, guild }) => await this.deleteAppCommand(id, guild)))
      await Promise.all([...Object.values(after.slashCommands), ...Object.values(after.contextMenuCommands)]
        .map(async it => await this.upsertAppCommand(it.builder.toJSON(), it.guild)))

      this.modules[newId] = this.stagedModules[newId]
      delete this.stagedModules[newId]

      // Missing intents
      const missingIntents = this.client.options.intents.missing(after.intents)
      if (missingIntents.length > 0) {
        this.client.destroy()
        // must do this.modules[newId] = this.stagedModules[newId] before this
        // this derives the new intents and listeners from this.modules
        this.resetClient()
      }
    }
  }

  async start (): Promise<void> {
    await this.client.login(this.token)
  }

  private resetClient (): void {
    this.client.removeAllListeners()
    this.client.destroy()
    this.client.options.intents = this.client.options.intents.add(Object.values(this.modules).flatMap(m => m.intents))
    this.client.token = this.token
    this.client.rest.setToken(this.token)
    this.client.once(Events.ClientReady, () => {
      console.info('ModuleHost client is ready!')
    })
    for (const mod of Object.values(this.modules)) {
      mod.applyToClient()
    }
  }

  private async deleteAppCommand (id: string, guild?: string): Promise<void> {
    await this.client.rest.delete(guild === undefined
      ? Routes.applicationCommand(this.clientId, id)
      : Routes.applicationGuildCommand(this.clientId, guild, id))
  }

  private async upsertAppCommand (data: RESTPostAPIApplicationCommandsJSONBody, guild?: string): Promise<void> {
    await this.client.rest.post(guild === undefined
      ? Routes.applicationCommands(this.clientId)
      : Routes.applicationGuildCommands(this.clientId, guild), { body: data })
  }
}
