import type { CheckpointMessage } from '../../../../domain/agent-run-recovery'
import type { AgentProgressStopReason } from '../../../../domain/agent-progress-detector'
import type { ResponseLanguageSnapshot } from '../../../../domain/response-language'

export function formatAgentDegradedConclusion(input: {
  messageWindow: readonly CheckpointMessage[]
  reason: AgentProgressStopReason
  locale: ResponseLanguageSnapshot['locale']
}): string {
  const artifactPaths = completedArtifactPaths(input.messageWindow)
  const failureCodes = failedToolCodes(input.messageWindow)
  const pdfUnavailable = failureCodes.has('document_export_unavailable')
  const artifacts = artifactPaths.map((path) => `\`${path}\``).join(', ')

  if (input.locale === 'zh-CN') {
    if (pdfUnavailable) {
      return artifactPaths.length > 0
        ? `任务未能完成 PDF 交付：当前设备未检测到 LibreOffice，无法导出 PDF。已成功生成可用的 DOCX：${artifacts}。请安装 LibreOffice 后重试 PDF 导出，或直接使用该 DOCX。`
        : '任务未能完成 PDF 交付：当前设备未检测到 LibreOffice，无法导出 PDF。请安装 LibreOffice 后重试。'
    }
    return artifactPaths.length > 0
      ? `任务已暂停，未能完成最终交付：${stopReasonLabel(input.reason, input.locale)}。已保留中间产物：${artifacts}。请检查失败详情后继续。`
      : `任务已暂停，未能完成最终交付：${stopReasonLabel(input.reason, input.locale)}。请检查失败详情后继续。`
  }
  if (input.locale === 'ja') {
    if (pdfUnavailable) {
      return artifactPaths.length > 0
        ? `PDF の生成を完了できませんでした。現在の端末では LibreOffice が検出されず、PDF を書き出せません。利用可能な DOCX は生成済みです: ${artifacts}。LibreOffice をインストールして再試行するか、この DOCX を使用してください。`
        : 'PDF の生成を完了できませんでした。現在の端末では LibreOffice が検出されません。LibreOffice をインストールして再試行してください。'
    }
    return artifactPaths.length > 0
      ? `タスクを一時停止し、最終成果物を完成できませんでした: ${stopReasonLabel(input.reason, input.locale)}。中間成果物は保持されています: ${artifacts}。失敗の詳細を確認してから続行してください。`
      : `タスクを一時停止し、最終成果物を完成できませんでした: ${stopReasonLabel(input.reason, input.locale)}。失敗の詳細を確認してから続行してください。`
  }
  if (pdfUnavailable) {
    return artifactPaths.length > 0
      ? `The task could not complete PDF delivery because LibreOffice is unavailable on this device. A usable DOCX was created: ${artifacts}. Install LibreOffice and retry PDF export, or use the DOCX directly.`
      : 'The task could not complete PDF delivery because LibreOffice is unavailable on this device. Install LibreOffice and retry.'
  }
  return artifactPaths.length > 0
    ? `The task paused and could not complete the final delivery: ${stopReasonLabel(input.reason, input.locale)}. Intermediate artifacts were preserved: ${artifacts}. Review the failure details before continuing.`
    : `The task paused and could not complete the final delivery: ${stopReasonLabel(input.reason, input.locale)}. Review the failure details before continuing.`
}

export function formatAgentProviderFailureArtifactConclusion(input: {
  messageWindow: readonly CheckpointMessage[]
  locale: ResponseLanguageSnapshot['locale']
}): string | undefined {
  const artifactPaths = completedArtifactPaths(input.messageWindow)
  if (artifactPaths.length === 0) return undefined
  const artifacts = artifactPaths.map((path) => `\`${path}\``).join(', ')

  if (input.locale === 'zh-CN') {
    return `任务产物已生成，但模型在最终总结时请求失败。已生成产物：${artifacts}。你可以直接打开产物预览。`
  }
  if (input.locale === 'ja') {
    return `成果物は生成されましたが、最終要約中にモデルリクエストが失敗しました。生成済みの成果物: ${artifacts}。成果物を直接開いてプレビューできます。`
  }
  return `The artifact was generated, but the model request failed while producing the final summary. Generated artifact: ${artifacts}. You can open the artifact directly for preview.`
}

function completedArtifactPaths(
  messageWindow: readonly CheckpointMessage[],
): string[] {
  const paths = new Set<string>()
  for (const message of messageWindow) {
    if (
      message.role !== 'tool' ||
      !isArtifactProducingToolName(message.name)
    ) {
      continue
    }
    const result = parseToolMessage(message.content)
    if (
      result?.status === 'failed' ||
      typeof result?.path !== 'string' ||
      !result.path.trim()
    ) {
      continue
    }
    paths.add(publicArtifactPath(result.path))
  }
  return [...paths]
}

function isArtifactProducingToolName(name: string | undefined): boolean {
  return Boolean(
    name &&
      [
        'document_create',
        'document_export_pdf',
        'pdf_inspect',
        'pdf_save',
        'image_save',
        'artifact_verify',
      ].some((token) => name.includes(token)),
  )
}

function failedToolCodes(
  messageWindow: readonly CheckpointMessage[],
): Set<string> {
  const codes = new Set<string>()
  for (const message of messageWindow) {
    if (message.role !== 'tool') continue
    const result = parseToolMessage(message.content)
    if (
      result?.status === 'failed' &&
      typeof result.errorCode === 'string'
    ) {
      codes.add(result.errorCode)
    }
  }
  return codes
}

function parseToolMessage(
  content: string,
): Record<string, unknown> | undefined {
  try {
    const parsed: unknown = JSON.parse(content)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : undefined
  } catch {
    return undefined
  }
}

function publicArtifactPath(path: string): string {
  if (!path.startsWith('/') && !/^[A-Za-z]:[\\/]/.test(path)) return path
  return path.split(/[\\/]/).filter(Boolean).at(-1) ?? 'artifact'
}

function stopReasonLabel(
  reason: AgentProgressStopReason,
  locale: ResponseLanguageSnapshot['locale'],
): string {
  const labels = {
    'zh-CN': {
      repeated_tool_call: '检测到重复工具调用',
      consecutive_tool_failures: '连续工具执行失败',
      capability_unavailable: '所需能力在当前设备不可用',
    },
    en: {
      repeated_tool_call: 'repeated Tool calls were detected',
      consecutive_tool_failures: 'multiple Tool executions failed consecutively',
      capability_unavailable: 'a required capability is unavailable',
    },
    ja: {
      repeated_tool_call: '同じツール呼び出しが繰り返されました',
      consecutive_tool_failures: 'ツール実行が連続して失敗しました',
      capability_unavailable: '必要な機能を現在の端末で利用できません',
    },
  }
  return labels[locale][reason]
}
