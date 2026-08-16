import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { listAgents } from '../api/agents'
import {
  blockTask,
  createTask,
  deleteTask,
  listTasks,
  patchTask,
  rejectTask,
  taskAction,
} from '../api/tasks'
import type { Status, TaskCreateInput, TaskPatchInput } from '../types'

// Polling cadence (unchanged from the vanilla UI): the board is a
// single-user surface, so light polling beats websockets here.
export const REFRESH_MS = 5000

export function useTasks() {
  return useQuery({ queryKey: ['tasks'], queryFn: () => listTasks(), refetchInterval: REFRESH_MS })
}

export function useArchivedTasks(enabled: boolean) {
  return useQuery({
    queryKey: ['tasks', 'archived'],
    queryFn: () => listTasks('archived'),
    enabled,
    refetchInterval: enabled ? REFRESH_MS : false,
  })
}

export function useAgents() {
  return useQuery({ queryKey: ['agents'], queryFn: listAgents, refetchInterval: REFRESH_MS })
}

function useInvalidatingMutation<TVars, TData>(fn: (vars: TVars) => Promise<TData>) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ['tasks'] })
      void qc.invalidateQueries({ queryKey: ['agents'] })
    },
  })
}

export function useCreateTask() {
  return useInvalidatingMutation((input: TaskCreateInput) => createTask(input))
}

export function usePatchTask() {
  return useInvalidatingMutation(({ id, input }: { id: string; input: TaskPatchInput }) => patchTask(id, input))
}

export function useDeleteTask() {
  return useInvalidatingMutation((id: string) => deleteTask(id))
}

export function useTaskAction() {
  return useInvalidatingMutation(
    ({ id, action }: { id: string; action: 'unblock' | 'complete' | 'archive' | 'recycle' }) =>
      taskAction(id, action),
  )
}

export function useBlockTask() {
  return useInvalidatingMutation(({ id, reason }: { id: string; reason?: string }) => blockTask(id, reason))
}

export function useRejectTask() {
  return useInvalidatingMutation(({ id, feedback }: { id: string; feedback?: string }) => rejectTask(id, feedback))
}

export type { Status }
