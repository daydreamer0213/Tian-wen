export type DesktopLocale = 'zh' | 'en'

const COPY = {
  zh: {
    selectNodeTitle: '选择 Node 可执行文件',
    nodeExecutableFilter: 'Node 可执行文件',
    selectDshRootTitle: '选择 DSH 根目录',
    selectDshHomeTitle: '选择 DSH 主目录',
    savedTargetInvalid: '已保存的 Tianwen Desktop 目标无效',
    chooseReplacement: '选择替代目标',
    cancel: '取消',
    selectedTargetInvalid: '所选 Tianwen Desktop 目标无效',
    ok: '确定',
    createProfileTitle: '创建 Tianwen Web Profile？',
    createProfileInstruction: 'Tianwen Desktop 将请求所选 DSH 一次性创建这个缺失的 Profile：',
    createProfileAction: '创建 Profile',
    updateRuntimeTitle: '更新 Tianwen Runtime？',
    updateRuntimeInstruction: '现有 Web Profile 使用旧版 Runtime 0.1.8。Tianwen Desktop 可以用内嵌的 0.1.9 安装包原地更新一次：',
    updateRuntimeAction: '更新 Runtime',
    manualPreparationTitle: '需要手动准备 Web Profile',
    manualPreparationInstruction: '运行此 PowerShell 命令，然后重新打开 Tianwen Desktop：',
    fatalStartupTitle: 'Tianwen Desktop 启动失败',
  },
  en: {
    selectNodeTitle: 'Select Node executable',
    nodeExecutableFilter: 'Node executable',
    selectDshRootTitle: 'Select DSH root',
    selectDshHomeTitle: 'Select DSH home',
    savedTargetInvalid: 'Saved Tianwen Desktop target is invalid',
    chooseReplacement: 'Choose replacement',
    cancel: 'Cancel',
    selectedTargetInvalid: 'Selected Tianwen Desktop target is invalid',
    ok: 'OK',
    createProfileTitle: 'Create the Tianwen Web Profile?',
    createProfileInstruction: 'Tianwen Desktop will ask the selected DSH to create this missing Profile once:',
    createProfileAction: 'Create Profile',
    updateRuntimeTitle: 'Update the Tianwen Runtime?',
    updateRuntimeInstruction: 'The existing Web Profile uses Runtime 0.1.8. Tianwen Desktop can update it once with the embedded 0.1.9 package:',
    updateRuntimeAction: 'Update Runtime',
    manualPreparationTitle: 'Manual Web Profile preparation is required',
    manualPreparationInstruction: 'Run this PowerShell command, then open Tianwen Desktop again:',
    fatalStartupTitle: 'Tianwen Desktop failed to start',
  },
} as const

export function desktopLocale(systemLocale = Intl.DateTimeFormat().resolvedOptions().locale): DesktopLocale {
  try {
    return new Intl.Locale(systemLocale).language === 'zh' ? 'zh' : 'en'
  } catch {
    return 'en'
  }
}

export function chromiumLocale(locale: DesktopLocale): 'zh-CN' | 'en' {
  return locale === 'zh' ? 'zh-CN' : 'en'
}

export function desktopCopy(locale: DesktopLocale): typeof COPY[DesktopLocale] {
  return COPY[locale]
}
