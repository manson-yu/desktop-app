<template>
  <div class="layout" :class="messageOwnership()">
    <div>
      <span
        class="username"
        v-if="showName"
        :style="{color: getColor(message.userId), maxWidth: `${videoSize.width}px`}"
        @click="$emit('user-click')"
      >{{message.userFullName}}</span>
      <BadgeItem @handleMenuClick="$emit('handleMenuClick')" :type="message.type">
        <div
          class="content"
          :class="{reply: message.quoteContent}"
          :style="message.quoteContent ? `width: ${videoSize.width+8}px` : ''"
        >
          <div class="content-in">
            <ReplyMessageItem
              v-if="message.quoteContent"
              :message="JSON.parse(message.quoteContent)"
              :me="me"
              class="reply"
            ></ReplyMessageItem>
            <div class="video-box">
              <div class="left-label" v-if="!isCurVideo">
                <span
                  v-if="loading || waitStatus"
                >{{ (message.mediaSize/1000000 || 0).toFixed(1) + ' MB' }}</span>
                <span
                  v-else
                >{{ $moment((Math.floor((message.mediaDuration - 0) / 1000) || 1) * 1000).format('mm:ss') }}</span>
              </div>
              <LoadingIcon
                v-if="loading && fetchPercentMap[message.messageId] !== 100"
                class="loading"
                :percent="fetchPercentMap[message.messageId]"
                @userClick="stopLoading"
              />
              <AttachmentIcon
                v-else-if="waitStatus && fetchPercentMap[message.messageId] !== 100"
                class="loading"
                :me="me"
                :message="message"
                @mediaClick="$emit('mediaClick')"
              />
              <div class="media">
                <img
                  v-if="waitStatus"
                  class="image"
                  :style="defaultStyle"
                  :src="'data:image/jpeg;base64,' + message.thumbImage"
                  :onerror="`this.src='${defaultImg}';this.onerror=null`"
                />
                <div v-else>
                  <div :style="defaultStyle">
                    <video-player
                      ref="videoPlayer"
                      v-if="isCurVideo"
                      @loadeddata="loaded=true"
                      @enterpictureinpicture="enterpictureinpicture"
                      @leavepictureinpicture="leavepictureinpicture"
                      @play="onPlay"
                      @destroy="videoDestroy"
                      :options="playerOptions"
                    ></video-player>
                    <video
                      v-else
                      :src="message.mediaUrl"
                      :style="`background: #333; width: ${videoSize.width + (message.quoteContent ? 4 : 0)}px; height: ${videoSize.height}px`"
                      preload
                    ></video>
                    <svg-icon
                      class="play"
                      @click.stop="playIconClick"
                      icon-class="ic_play"
                      v-if="!loading && !pipLoading && !isCurVideo"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div class="bottom">
            <TimeAndStatus :relative="true" :message="message" />
          </div>
        </div>
      </BadgeItem>
    </div>
  </div>
</template>
<script lang="ts">
import ReplyMessageItem from './ReplyMessageItem.vue'
import BadgeItem from './BadgeItem.vue'
import TimeAndStatus from './TimeAndStatus.vue'
import AttachmentIcon from '@/components/chat-item/AttachmentIcon.vue'
import LoadingIcon from '@/components/LoadingIcon.vue'
import { MessageStatus, MediaStatus, DefaultImg } from '@/utils/constants'
import { getNameColorById, getVideoPlayerStatus } from '@/utils/util'

import { Vue, Prop, Watch, Component } from 'vue-property-decorator'
import { Getter, Action } from 'vuex-class'

@Component({
  components: {
    AttachmentIcon,
    LoadingIcon,
    ReplyMessageItem,
    BadgeItem,
    TimeAndStatus
  }
})
export default class VideoItem extends Vue {
  @Prop(Object) readonly conversation: any
  @Prop(Object) readonly message: any
  @Prop(Object) readonly me: any
  @Prop(Boolean) readonly showName: any

  @Getter('attachment') attachment: any
  @Getter('fetchPercentMap') fetchPercentMap: any
  @Getter('currentVideo') currentVideo: any

  @Action('stopLoading') actionStopLoading: any
  @Action('setCurrentVideo') actionSetCurrentVideo: any

  @Watch('message.mediaUrl')
  onMediaUrlChanged(url: any) {
    this.playerOptions = this.getPlayerOptions()
  }

  @Watch('loaded')
  onLoadedChanged(flag: any) {
    if (flag) {
      // @ts-ignore
      this.$refs.videoPlayer.play()
    }
  }

  MediaStatus: any = MediaStatus
  MessageStatus: any = MessageStatus
  $moment: any
  loaded: boolean = false
  pipLoading: boolean = false
  playerOptions: any = {}

  get defaultStyle() {
    return `width: ${this.videoSize.width + (this.message.quoteContent ? 4 : 0)}px; height: ${this.videoSize.height}px`
  }

  get defaultImg() {
    return DefaultImg
  }

  get waitStatus() {
    const { message } = this
    return MediaStatus.CANCELED === message.mediaStatus || MediaStatus.EXPIRED === message.mediaStatus
  }
  get loading() {
    return this.attachment.includes(this.message.messageId)
  }

  get videoSize() {
    let { mediaWidth, mediaHeight } = this.message
    let width = 200
    let height = (200 / mediaWidth) * mediaHeight
    if (height > 400) {
      height = 400
      width = (400 / mediaHeight) * mediaWidth
    }
    return {
      width,
      height
    }
  }

  get isCurVideo() {
    if (!this.currentVideo) return false
    return this.currentVideo.message.messageId === this.message.messageId
  }

  getPlayerOptions() {
    return {
      language: navigator.language.split('-')[0],
      playbackRates: ['0.5', '1.0', '1.5', '2.0'],
      width: this.videoSize.width + (this.message.quoteContent ? 4 : 0),
      height: this.videoSize.height,
      sources: [
        {
          type: 'video/mp4',
          src: this.message.mediaUrl
        }
      ]
      // poster: this.message.thumbImage ? 'data:image/jpeg;base64,' + this.message.thumbImage : this.defaultImg
    }
  }

  mounted() {
    requestAnimationFrame(() => {
      this.playerOptions = this.getPlayerOptions()
    })
  }

  messageOwnership() {
    let { message, me } = this
    return {
      send: message.userId === me.user_id,
      receive: message.userId !== me.user_id
    }
  }
  getColor(id: any) {
    return getNameColorById(id)
  }

  stopLoading() {
    this.actionStopLoading(this.message.messageId)
  }

  onPlay() {}

  enterpictureinpicture() {
    this.pipLoading = true
    this.$emit('pipClick')
    this.actionSetCurrentVideo(null)
    setTimeout(() => {
      this.pipLoading = false
    }, 1000)
  }

  leavepictureinpicture() {}

  playIconClick() {
    this.actionSetCurrentVideo({ message: this.message, playerOptions: this.playerOptions })
  }

  videoDestroy() {
    // @ts-ignore
    const player = this.$refs.videoPlayer.player
    if (player.isInPictureInPicture_) {
      player.exitPictureInPicture()
    } else if (this.isCurVideo) {
      this.actionSetCurrentVideo(null)
    }
    this.loaded = false
  }
}
</script>
<style lang="scss" scoped>
.layout {
  display: flex;
  margin-left: 0.3rem;
  margin-right: 0.3rem;
  .username {
    display: inline-block;
    font-size: 0.65rem;
    max-width: 100%;
    text-overflow: ellipsis;
    overflow: hidden;
    white-space: nowrap;
    margin-bottom: 0.15rem;
    margin-left: 0.3rem;
    min-width: 1.6rem;
    min-height: 0.65rem;
  }
  .content {
    display: flex;
    flex: 1;
    flex-direction: column;
    text-align: start;
    overflow: hidden;
    .content-in {
      font-size: 0;
    }
    &.reply {
      .content-in {
        background: #fff;
        padding: 0.1rem;
        border-radius: 0.2rem;
        .loading {
          top: calc(50% + 0.6rem);
        }
      }
    }
    .reply {
      margin-bottom: 0.1rem;
    }
    .video-box {
      position: relative;
      .left-label {
        position: absolute;
        z-index: 100;
        font-size: 0.55rem;
        color: #fff;
        background: #33333355;
        border-radius: 0.15rem;
        left: 0.25rem;
        top: 0.25rem;
        padding: 0.1rem 0.2rem;
      }
      .play,
      .loading {
        cursor: pointer;
        width: 1.6rem;
        height: 1.6rem;
        left: 50%;
        top: 50%;
        position: absolute;
        transform: translate(-50%, -50%);
        z-index: 3;
      }
      .accachment {
        background: #000000b6;
        color: #fff;
      }
      .media {
        font-size: 0;
        overflow: hidden;
        white-space: nowrap;
        text-overflow: ellipsis;
        border-radius: 0.2rem;
      }
    }
    .bottom {
      display: flex;
      padding: 0.1rem;
      justify-content: flex-end;
    }
  }
}
.layout.send {
  flex-direction: row-reverse;
}
.layout.receive {
  flex-direction: row;
}
</style>
