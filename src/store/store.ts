import Vue from 'vue'
import Vuex from 'vuex'

import mutations from './mutations'
import actions from './actions'
import getters from './getters'
import { LinkStatus } from '@/utils/constants'

Vue.use(Vuex)

const state = {
  me: {},
  currentConversationId: null,
  conversations: {},
  conversationKeys: [],
  friends: [],
  currentUser: {},
  searching: '',
  currentMessages: [],
  attachment: [],
  search: {
    contact: null,
    chats: null,
    message: null,
    contactAll: null,
    chatsAll: null,
    messageAll: null
  },
  currentAudio: null,
  showTime: false,
  editing: false,
  linkStatus: LinkStatus.CONNECTED
}

export default new Vuex.Store({
  state: state,
  // @ts-ignore
  getters: getters,
  actions: actions,
  mutations: mutations
})