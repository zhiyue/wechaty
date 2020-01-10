import path       from 'path'

import readPkgUp  from 'read-pkg-up'
import npm        from 'npm-programmatic'
import pkgDir     from 'pkg-dir'
import semver     from 'semver'
import inGfw      from 'in-gfw'

import {
  Puppet,
  PuppetImplementation,
  PuppetOptions,
}                         from 'wechaty-puppet'

import {
  log,
}                       from './config'
import {
  PUPPET_DEPENDENCIES,
  PuppetModuleName,
}                       from './puppet-config'

export interface ResolveOptions {
  puppet         : Puppet | PuppetModuleName,
  puppetOptions? : PuppetOptions,
}

export class PuppetManager {

  public static async resolve (
    options: ResolveOptions
  ): Promise<Puppet> {
    log.verbose('PuppetManager', 'resolve({puppet: %s, puppetOptions: %s})',
      options.puppet,
      JSON.stringify(options.puppetOptions),
    )

    let puppetInstance: Puppet

    if (options.puppet instanceof Puppet) {
      puppetInstance = await this.resolveInstance(options.puppet)
    } else {
      const MyPuppet = await this.resolveName(options.puppet)
      /**
       * We will meet the following error:
       *
       *  [ts] Cannot use 'new' with an expression whose type lacks a call or construct signature.
       *
       * When we have different puppet with different `constructor()` args.
       * For example: PuppetA allow `constructor()` but PuppetB requires `constructor(options)`
       *
       * SOLUTION: we enforce all the PuppetImplenmentation to have `options` and should not allow default parameter.
       * Issue: https://github.com/wechaty/wechaty-puppet/issues/2
       */
      puppetInstance = new MyPuppet(options.puppetOptions)
    }

    return puppetInstance
  }

  protected static async resolveName (puppetName: PuppetModuleName): Promise<PuppetImplementation> {
    log.verbose('PuppetManager', 'resolveName(%s)', puppetName)

    if (!puppetName) {
      throw new Error('must provide a puppet name')
    }

    // TODO(huan): remove the unnecessary switch
    switch (puppetName) {
      // case 'padchat':
      //   // issue #1496 https://github.com/wechaty/wechaty/issues/1496
      //   // compatible old settings for padchat
      //   puppetName = 'wechaty-puppet-padchat'
      //   break

      // case 'mock':
      //   puppetName = 'wechaty-puppet-mock'
      //   break

      // case 'default':
      //   puppetName = PUPPET_NAME_DEFAULT
      //   break

      default:
        if (!(puppetName in PUPPET_DEPENDENCIES)) {
          throw new Error(
            [
              '',
              'puppet npm module not supported: "' + puppetName + '"',
              'learn more about supported Wechaty Puppet from our directory at',
              '<https://github.com/wechaty/wechaty-puppet/wiki/Directory>',
              '',
            ].join('\n')
          )
        }
        // PuppetName is valid
        break
    }

    await this.checkModule(puppetName)

    const puppetModule = await import(puppetName)
    const MyPuppet     = puppetModule.default as PuppetImplementation

    return MyPuppet
  }

  protected static async checkModule (puppetName: PuppetModuleName): Promise<void> {
    log.verbose('PuppetManager', 'checkModule(%s)', puppetName)

    const versionRange = PUPPET_DEPENDENCIES[puppetName]

    /**
     * 1. Not Installed
     */
    if (!this.installed(puppetName)) {
      log.silly('PuppetManager', 'checkModule(%s) not installed.', puppetName)
      await this.install(puppetName, versionRange)
      return
    }

    const moduleVersion = this.getModuleVersion(puppetName)

    const satisfy = semver.satisfies(
      moduleVersion,
      versionRange,
    )

    /**
     * 2. Installed But Version Not Satisfy
     */
    if (!satisfy) {
      log.silly('PuppetManager', 'checkModule() %s installed version %s NOT satisfied range %s',
        puppetName,
        moduleVersion,
        versionRange,
      )
      await this.install(puppetName, versionRange)
      return
    }

    /**
     * 3. Installed and Version Satisfy
     */
    log.silly('PuppetManager', 'checkModule() %s installed version %s satisfied range %s',
      puppetName,
      moduleVersion,
      versionRange,
    )
  }

  protected static getModuleVersion (moduleName: string): string {
    const modulePath = path.dirname(
      require.resolve(
        moduleName,
      ),
    )
    const pkg     = readPkgUp.sync({ cwd: modulePath })!.packageJson
    const version = pkg.version

    return version
  }

  protected static async resolveInstance (instance: Puppet): Promise<Puppet> {
    log.verbose('PuppetManager', 'resolveInstance(%s)', instance)
    // const version = instance.version()
    // const name = instance.name()

    // const satisfy = semver.satisfies(
    //   version,
    //   puppetConfig.npm.version,
    // )

    // TODO: check the instance version to satisfy semver
    return instance
  }

  protected static installed (moduleName: string): boolean {
    try {
      require.resolve(moduleName)
      return true
    } catch (e) {
      return false
    }
  }

  private static async preInstallPuppeteer (): Promise<void> {
    let gfw = false
    try {
      gfw = await inGfw()
      if (gfw) {
        log.verbose('PuppetManager', 'preInstallPuppeteer() inGfw = true')
      }
    } catch (e) {
      log.verbose('PuppetManager', 'preInstallPuppeteer() exception: %s', e)
    }

    // https://github.com/GoogleChrome/puppeteer/issues/1597#issuecomment-351945645
    if (gfw && !process.env['PUPPETEER_DOWNLOAD_HOST']) {
      log.info('PuppetManager', 'preInstallPuppeteer() set PUPPETEER_DOWNLOAD_HOST=https://npm.taobao.org/mirrors/')
      process.env['PUPPETEER_DOWNLOAD_HOST'] = 'https://npm.taobao.org/mirrors/'
    }
  }

  public static async install (
    puppetModule: string,
    puppetVersion = 'latest',
  ): Promise<void> {
    log.info('PuppetManager', 'install(%s@%s) please wait ...', puppetModule, puppetVersion)

    if (puppetModule === 'wechaty-puppet-puppeteer') {
      await this.preInstallPuppeteer()
    }

    await npm.install(
      `${puppetModule}@${puppetVersion}`,
      {
        cwd    : await pkgDir(__dirname),
        output : true,
        save   : false,
      },
    )
    log.info('PuppetManager', 'install(%s@%s) done', puppetModule, puppetVersion)
  }

  /**
   * Install all `wechaty-puppet-*` modules from `puppet-config.ts`
   */
  public static async installAll (): Promise<void> {
    log.info('PuppetManager', 'installAll() please wait ...')

    const moduleList: string[] = []

    for (const puppetModuleName of Object.keys(PUPPET_DEPENDENCIES)) {
      const version = PUPPET_DEPENDENCIES[puppetModuleName as PuppetModuleName]
      if (version !== '0.0.0') {
        moduleList.push(`${puppetModuleName}@${version}`)
      }
    }

    await npm.install(
      moduleList,
      {
        cwd    : await pkgDir(__dirname),
        output : true,
        save   : false,
      },
    )

  }

}
