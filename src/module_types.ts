import {
  ApplicationCommandType,
  Awaitable,
  ChatInputCommandInteraction,
  ClientEvents,
  CommandInteraction,
  ContextMenuCommandBuilder,
  SlashCommandBuilder,
  Client,
  UserContextMenuCommandInteraction,
  MessageContextMenuCommandInteraction,
  GatewayIntentBits
} from 'discord.js'

/**
 * A description of the details of an interaction and how to respond when someone uses it.
 * @template B The type of builder for the interaction that this object describes.
 * @template I The type of interaction that this object describes.
 * @template T Any arbitrary type for the information successfully resolved in the `check` stage to be passed to the `run` stage.
 */
export interface CommandConfig<B extends SlashCommandBuilder | ContextMenuCommandBuilder, I extends CommandInteraction, T = void> {
  /**
   * The snowflake ID of the guild to make this command available to.
   * If not specified, this command will be registered as a global command
   * (available to all guilds with the `applications.commands` scope and DMs)
   */
  guild?: string

  /**
   * Supply details about the interaction being built.
   * @param builder The builder for you to attach details to.
   */
  build?: (builder: B) => Pick<B, 'toJSON' | 'name'>

  /**
   * Validate the incoming interaction to see whether you should let it take effect.
   * For example, for the quoting module, we would ensure that the message being quoted contains visible text.
   *
   * If you detect any problems with the interaction and decide that it shouldn't take effect, throw an {@link Error}.
   *
   * @param interaction The interaction you are responding to. Do not reply to this interaction directly. If you find it invalid, throw an {@link Error}.
   */
  check?: (interaction: Omit<I, 'reply' | 'showModal'>) => Awaitable<T>

  /**
   * Fulfill the incoming interaction after it has been checked with {@link check}.
   * @param interaction The interaction you are responding to.
   * @param checkReturnValue The return value of the call to {@link check} with this interaction.
   */
  run: (interaction: I, checkReturnValue?: T) => Awaitable<string> | undefined
}

/**
 * Either an object with "guild build check run" components describing a handler or
 * just the "run" function describing how to respond to an interaction.
 */
export type CommandConfigOrOnRun<B extends SlashCommandBuilder | ContextMenuCommandBuilder, I extends CommandInteraction, T = void> =
  | CommandConfig<B, I, T>
  | ((i: I) => Awaitable<string> | undefined)

/**
 * A module describes a coherent high-level feature, such as quote tracking, class lookups, and schedule sharing.
 * @template ID Type of object that uniquely identifies a command or event handler for tracking and deletion.
 */
export interface IModule<ID> {
  /**
   * A label that uniquely identifies this module in the entire Bot client.
   * During the workshop, the shared client uses this ID to coordinate event handler and command replacements during deployment.
   */
  id: string

  /**
   * Gateway intents required by your module's features.
   *
   * Gateway intents tell Discord what to notify the bot about. If you want to listen for messages from a guild using {@link when},
   * you would want to include {@link GatewayIntentBits.GuildMessages} so that Discord notifies your bot about guild messages.
   */
  intents: GatewayIntentBits[]

  /**
   * Register an event handler.
   * @param event The event(s) that trigger this handler. Choose from {@link Events}.
   * @param handler The function to run when the given event(s) are detected.
   * @returns An ID that you can pass to {@link IModule.remove} in order to unregister this event handler.
   * @example mod.when(Events.MessageCreate, msg => msg.react('✨'));
   * @example mod.when([Events.MessageUpdate, Events.MessageDelete], async msg => await msg.channel.send('sneaky!'));
   */
  when: <K extends keyof ClientEvents>(
    event: K | K[],
    handler: (...args: ClientEvents[K]) => Awaitable<any>
  ) => ID

  /**
   * Register an event handler that only runs at most once.
   * @param event The event(s) that trigger this handler once. Choose from {@link Events}.
   * @param handler The function to run when the given event(s) are detected for the first time.
   * @returns An ID that you can pass to {@link IModule.remove} in order to unregister this event handler.
   * @example mod.once(Events.Error, () => process.exit(1));
   */
  once: <K extends keyof ClientEvents>(
    event: K | K[],
    handler: (...args: ClientEvents[K]) => Awaitable<any>
  ) => ID

  /**
   * Create a slash (/) command.
   * @param command The command itself without the leading slash. For example, `"nick"` refers to the command `/nick`.
   * @param description A brief description of this command that is shown with this command when a user types it.
   * @param handlers Functions that specify the details of this command and how to react when someone uses it.
   * @returns An ID that you can pass to {@link IModule.remove} in order to remove this slash command.
   */
  slash: <T>(
    command: string,
    description: string,
    handlers: CommandConfigOrOnRun<SlashCommandBuilder, ChatInputCommandInteraction, T>
  ) => ID

  /**
   * Create a context menu item.
   * @param label The text label of the menu item to add.
   * @param type The type of entity to attach this menu item to. Do you want users to see this item when they right click on users or on messages?
   * @param handlers Functions that specify the details of this menu command and how to react when someone uses it.
   * @returns An ID that you can pass to {@link IModule.remove} in order to remove this menu item.
   */
  menu: <
    T,
    I extends ApplicationCommandType.User | ApplicationCommandType.Message
  >(
    label: string,
    type: I,
    handlers: CommandConfigOrOnRun<ContextMenuCommandBuilder,
    I extends ApplicationCommandType.User
      ? UserContextMenuCommandInteraction
      : MessageContextMenuCommandInteraction,
    T
    >
  ) => ID

  /**
   * Unregister or remove an event handler, command, or context menu item.
   * @param handler The ID returned by the function that created the event handler, command, or other interaction you want to remove.
   */
  remove: (handler: ID) => boolean

  /**
   * The underlying client instance hosting this module. Use this to access guild managers, create DM channels, manage the bot's presence, etc.
   */
  client: Client
}
