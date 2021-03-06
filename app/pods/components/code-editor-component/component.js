import Component from '@ember/component';
import { inject as service } from '@ember/service';
import { dropTask } from 'ember-concurrency-decorators';
import { timeout } from 'ember-concurrency';
import { later } from '@ember/runloop';
import { computed } from '@ember/object'

export default class CodeEditorComponent extends Component {
  @service api
  @service store

  lastResult = null
  showAwardedBadge = false

  @computed('problem.id', 'contest.id')
  get storageKey () {
    return `hb:code:${this.problem.id}:${this.contest.id}`
  }

  @dropTask onRunTask = function*(language, code, input) {
    try {
      this.set('resultComponent', 'submission-status')
      const response = yield this.api.request('submissions/run', {
        method: 'POST',
        data: {
          problem_id: this.problem.id,
          input: window.btoa(input),
          source: window.btoa(code),
          language
        }
      })
      let maxTries = 30
      while(maxTries--) {
        yield timeout(2000)
        const submission = yield this.store.findRecord('submission', response.submissionId, { refresh: true })
        if (submission.judge_result){
          this.set('resultComponent', 'run-result')
          this.set('lastResult', submission.judge_result)
          return submission
        }
      }
      return null
    } catch (err) {
      this.set('resultComponent', '')
      if (err.status == 429) {
        this.set('submitSpam', true)
        later(() => this.set('submitSpam', false), 10000)
      }
    }
  }

  @dropTask onSubmitTask = function*(language, code) {
    try {
      this.set('resultComponent', 'submission-status')

      const response = yield this.api.request('submissions/submit', {
        method: 'POST',
        data: {
          contest_id: this.contest.id,
          problem_id: this.problem.id,
          source: window.btoa(code),
          language
        }
      })
  
      let maxTries = 30
      while(maxTries--) {
        yield timeout(2000)
        const submission = yield this.store.findRecord('submission', response.submissionId, {
          refresh: true,
          include: 'badge'
        })
        if (submission.get('badge.id')) {
          this.set('badge', submission.get('badge'))
          this.set('showAwardedBadge', true)
        }
        if (submission.judge_result){
          if (submission.judge_result.error){
            this.set('resultComponent', 'run-result')
          } else {
            this.set('resultComponent', 'submit-result')
          }
          this.set('lastResult', submission.judge_result)
  
          if (this.fullScreen) {
            const score = +submission.score
            const progress = yield this.problem.get('progress')
            if (progress.get('status') === 'done') {
              return
            }
            if (score === 100) {
              progress.set('status', 'done')
            } else if (score > 0 && score < 100) {
              progress.set('status', 'undone')
            } else {
              progress.set('status', 'failed')
            }
            progress.save()
          }
          return submission
        }
      }
      return null
    } catch (err) {
      this.set('resultComponent', '')
      if (err.status == 429) {
        this.set('submitSpam', true)
        later(() => this.set('submitSpam', false), 10000)
      }
    }
  }
}
