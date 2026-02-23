import { taskScheduler } from '#server/utils/task-scheduler';

export default defineNitroPlugin(() => {
  taskScheduler.startScheduler();
});
