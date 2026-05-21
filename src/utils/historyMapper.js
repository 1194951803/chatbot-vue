/**
 * 历史消息映射工具
 * 将后端 FileChatHistoryMessageVo 转换为前端消息格式
 */

/** 解析 functype=3 的 JSON answer */
export function parseEmployeeAnswer(answer) {
  if (!answer) return null
  try {
    return JSON.parse(answer)
  } catch {
    return { content: answer }
  }
}

/** 解析 FileRecoedsDto 的 fileContent JSON */
export function parseFileContent(fileContent) {
  if (!fileContent) return null
  try {
    return JSON.parse(fileContent)
  } catch {
    return null
  }
}

/** 将 tool_call 对象转为 interactive_card 消息 */
export function buildCardFromToolCall(toolCall, parsed, time) {
  const name = toolCall.name
  const args = typeof toolCall.arguments === 'string'
    ? (() => { try { return JSON.parse(toolCall.arguments) } catch { return {} } })()
    : (toolCall.arguments || {})

  switch (name) {
    case 'leave_request':
      return {
        role: 'assistant', type: 'interactive_card', cardType: 'leave_form',
        cardData: {
          type: args.leaveType || '年假', startDate: args.startDate || '',
          endDate: args.endDate || args.startDate || '', reason: args.reason || '',
          status: '待提交',
        },
        time, noFeedback: true,
      }

    case 'salary_query':
      return {
        role: 'assistant', type: 'interactive_card', cardType: 'salary',
        cardData: {
          month: args.queryMonth || args.month || '本月',
          baseSalary: args.baseSalary || '', performance: args.performance || '',
          allowance: args.allowance || '', grossSalary: args.grossSalary || '',
          socialSecurity: args.socialSecurity || '', housingFund: args.housingFund || '',
          tax: args.tax || '', netSalary: args.netSalary || '',
        },
        time, noFeedback: true,
      }

    case 'personal_info':
      return {
        role: 'assistant', type: 'interactive_card', cardType: 'profile',
        cardData: {
          staffId: args.员工编号 || args.staff_id || '',
          name: args.姓名 || args.name || '',
          unitName: args.单位 || args.unit_name || '',
          deptName: args.部门 || args.dept_name || '',
          posName: args.岗位 || args.pos_name || '',
          email: args.邮箱 || args.email || '',
          phone: args.手机号 || args.phone || '',
        },
        time, noFeedback: true,
      }

    case 'personal_records': {
      // 含 URL 时渲染可点击消息框打开右侧报告面板
      if (args.url) {
        return {
          role: 'assistant',
          type: 'tool_assessment',
          content: parsed?.content || '正在查询个人报告...',
          toolName: '预览',
          url: args.url,
          time,
          noFeedback: true,
        }
      }
      return {
        role: 'assistant', content: parsed?.content || '', time, noFeedback: true,
      }
    }

    case 'annual_assessment': {
      // 工具参数包含 URL 时，渲染可点击消息框打开右侧考核面板
      if (args.url) {
        return {
          role: 'assistant',
          type: 'tool_assessment',
          content: parsed?.content || '正在查询年度考核信息...',
          toolName: '预览',
          url: args.url,
          time,
          noFeedback: true,
        }
      }
      return {
        role: 'assistant', content: parsed?.content || '正在查询年度考核信息...', time, noFeedback: true,
      }
    }

    default: {
      // 其他工具如果包含 URL 也渲染可点击消息框
      if (args.url) {
        return {
          role: 'assistant',
          type: 'tool_assessment',
          content: parsed?.content || `正在调用 ${name}...`,
          toolName: '预览',
          url: args.url,
          time,
          noFeedback: true,
        }
      }
      return { role: 'assistant', content: parsed?.content || '', time, noFeedback: true }
    }
  }
}

/** 格式化历史消息时间 */
export function formatHistoryTime(item) {
  if (item.createTs) {
    const match = String(item.createTs).match(/(\d{2}:\d{2})/)
    return match ? match[1] : ''
  }
  return ''
}
