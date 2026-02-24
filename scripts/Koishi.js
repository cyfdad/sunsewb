class MysteryCarousel {
  constructor(selector, options = {}) {
    this.container = document.querySelector(selector);
    this.stage = this.container.querySelector('.carousel-stage');

    this.images = options.images || [];
    this.autoInterval = options.autoInterval || 3500;
    this.stayDuration = options.stayDuration || 2500;
    this.slideDuration = options.slideDuration || 800;
    this.maxCards = options.maxCards || 20; //场上最大卡片数

    //状态
    this.cards = [];          //场上所有卡片数组
    this.imageIndex = 0;
    this.isAnimating = false;
    this.isDragging = false;
    this.dragMode = null;
    this.autoTimer = null;
    this.baseZIndex = 10;       //基础z-index
    this.topZIndex = 100;       //最高z-index
    this.currentTopCard = null;     //当前最顶层卡片

    //拖拽数据
    this.drag = {
      startX: 0,
      startY: 0,
      currentX: 0,
      currentY: 0,
      angle: 0,
      card: null,
      rotation: 0,
    };

    this._shuffleImages();
    this._preloadImages();
    this._bindEvents();
    this._startAuto();
  }

  _shuffleImages() {
    for (let i = this.images.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.images[i], this.images[j]] = [this.images[j], this.images[i]];
    }
  }

  _preloadImages() {
    this.images.forEach(src => {
      const img = new Image();
      img.src = src;
    });
  }

  _nextImageSrc() {
    const src = this.images[this.imageIndex % this.images.length];
    this.imageIndex++;
    return src;
  }

  _randomRotation(maxDeg = 5) {
    return (Math.random() - 0.5) * 2 * maxDeg;
  }

  //随机角度
  _randomAngle() {
    return Math.random() * Math.PI * 2;
  }

  //根据任意角度计算屏幕外的偏移位置
  _offscreenPositionByAngle(angle) {
    const rect = this.container.getBoundingClientRect();
    //计算射线从中心到矩形边界的交点距离，再加余量
    const hw = rect.width / 2;
    const hh = rect.height / 2;
    const cosA = Math.cos(angle);
    const sinA = Math.sin(angle);

    //射线与矩形边界的交点距离
    let t;
    if (Math.abs(cosA) * hh > Math.abs(sinA) * hw) {
      //与左右边界相交
      t = hw / Math.abs(cosA);
    } else {
      //与上下边界相交
      t = hh / Math.abs(sinA);
    }

    //加上图片尺寸余量确保完全在外面
    const margin = 350;
    const dist = t + margin;

    return {
      x: cosA * dist,
      y: sinA * dist,
    };
  }

  //随机一个停留位置（不严格居中，但中心距边缘>25%长宽）
  _randomStopPosition() {
    const rect = this.container.getBoundingClientRect();
    const marginX = rect.width * 0.25;
    const marginY = rect.height * 0.25;
    //可用区域：中心 ± (50% - 25%) = ± 25%
    const rangeX = rect.width * 0.25;
    const rangeY = rect.height * 0.25;
    return {
      x: (Math.random() - 0.5) * 2 * rangeX,
      y: (Math.random() - 0.5) * 2 * rangeY,
    };
  }

  //Z轴管理：将卡片提升到最顶层
  _bringToTop(card) {
    //如果之前有顶层卡片，恢复为普通z-index
    if (this.currentTopCard && this.currentTopCard !== card) {
      //找到它在cards数组中的位置作为z-index
      const idx = this.cards.indexOf(this.currentTopCard);
      if (idx >= 0) {
        this.currentTopCard.style.zIndex = this.baseZIndex + idx;
      }
    }
    card.style.zIndex = this.topZIndex;
    this.currentTopCard = card;
  }

  //从cards数组移除卡片
  _removeCard(card) {
    const idx = this.cards.indexOf(card);
    if (idx >= 0) {
      this.cards.splice(idx, 1);
    }
    if (this.currentTopCard === card) {
      this.currentTopCard = null;
    }
    if (card.parentNode) {
      card.parentNode.removeChild(card);
    }
    //刷新剩余卡片的z-index
    this.cards.forEach((c, i) => {
      if (c !== this.currentTopCard) {
        c.style.zIndex = this.baseZIndex + i;
      }
    });
  }

  //创建照片卡片
  _createCard(src) {
    const card = document.createElement('div');
    card.className = 'photo-card';

    const frame = document.createElement('div');
    frame.className = 'photo-frame';

    const img = document.createElement('img');
    img.src = src;
    img.draggable = false;

    frame.appendChild(img);
    card.appendChild(frame);

    return card;
  }

  //缓动
  _easeOutCubic(t) {
    return 1 - Math.pow(1 - t, 3);
  }

  _easeOutQuint(t) {
    return 1 - Math.pow(1 - t, 5);
  }

  //动画核心
  _animateCard(card, fromX, fromY, fromRot, toX, toY, toRot, duration) {
    return new Promise(resolve => {
      card.style.transform = `translate(calc(-50% + ${fromX}px), calc(-50% + ${fromY}px)) rotate(${fromRot}deg)`;
      //确保卡片在DOM中
      if (!card.parentNode) {
        this.stage.appendChild(card);
      }
      card.getBoundingClientRect();

      const startTime = performance.now();

      const tick = (now) => {
        const elapsed = now - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const ease = this._easeOutCubic(progress);

        const cx = fromX + (toX - fromX) * ease;
        const cy = fromY + (toY - fromY) * ease;
        const cr = fromRot + (toRot - fromRot) * ease;

        card.style.transform = `translate(calc(-50% + ${cx}px), calc(-50% + ${cy}px)) rotate(${cr}deg)`;

        if (progress < 1) {
          requestAnimationFrame(tick);
        } else {
          resolve();
        }
      };

      requestAnimationFrame(tick);
    });
  }

  //滑入方向+随机停留位置
  async _slideIn(angle) {
    if (this.cards.length >= this.maxCards) {
      //复数卡片自动移除最底下的一张
      await this._slideOutCard(this.cards[0]);
    }

    const inAngle = angle !== undefined ? angle : this._randomAngle();
    const src = this._nextImageSrc();
    const card = this._createCard(src);
    const rotation = this._randomRotation(4);
    const from = this._offscreenPositionByAngle(inAngle);
    const to = this._randomStopPosition();

    //设置z-index
    card.style.zIndex = this.baseZIndex + this.cards.length;
    this.stage.appendChild(card);
    this.cards.push(card);

    await this._animateCard(
      card,
      from.x, from.y, rotation * 2,
      to.x, to.y, rotation,
      this.slideDuration
    );

    return card;
  }

  //滑出指定卡片方向
  async _slideOutCard(card, angle) {
    if (!card) return;

    const outAngle = angle !== undefined ? angle : this._randomAngle();
    const to = this._offscreenPositionByAngle(outAngle);
    const currentRot = this._getCurrentRotation(card);
    const current = this._getCurrentTranslate(card);
    const exitRotation = currentRot + this._randomRotation(8);

    //先从数组移除引用，但DOM保留到动画结束
    const idx = this.cards.indexOf(card);
    if (idx >= 0) this.cards.splice(idx, 1);
    if (this.currentTopCard === card) this.currentTopCard = null;

    await this._animateCard(
      card,
      current.x, current.y, currentRot,
      to.x, to.y, exitRotation,
      this.slideDuration
    );

    if (card.parentNode) card.parentNode.removeChild(card);

    //刷新z-index
    this.cards.forEach((c, i) => {
      if (c !== this.currentTopCard) {
        c.style.zIndex = this.baseZIndex + i;
      }
    });
  }

  _getCurrentRotation(card) {
    const st = card.style.transform;
    const match = st.match(/rotate\(([-\d.]+)deg\)/);
    return match ? parseFloat(match[1]) : 0;
  }

  _getCurrentTranslate(card) {
    const st = card.style.transform;
    const matches = st.match(/calc\(-50% \+ ([-\d.]+)px\)/g);
    if (matches && matches.length >= 2) {
      const xMatch = matches[0].match(/([-\d.]+)px/);
      const yMatch = matches[1].match(/([-\d.]+)px/);
      return {
        x: xMatch ? parseFloat(xMatch[1]) : 0,
        y: yMatch ? parseFloat(yMatch[1]) : 0,
      };
    }
    return { x: 0, y: 0 };
  }

  //自动播放
  _startAuto() {
    this._stopAuto();
    this._scheduleNextAction();
  }

  _stopAuto() {
    clearTimeout(this.autoTimer);
  }

  _scheduleNextAction() {
    this._stopAuto();
    this.autoTimer = setTimeout(() => {
      this._autoAction();
    }, this.autoInterval);
  }

  async _autoAction() {
    if (this.isDragging) {
      this._scheduleNextAction();
      return;
    }

    //随机决定：滑入新的，或滑出最旧的
    //如果场上卡片少于2张，优先滑入；如果>=3张，优先滑出
    const shouldSlideIn = this.cards.length < 2 || (this.cards.length < this.maxCards && Math.random() > 0.4);

    if (shouldSlideIn) {
      await this._slideIn();
    } else if (this.cards.length > 0) {
      //滑出最底层的卡片
      await this._slideOutCard(this.cards[0]);
    }

    this._scheduleNextAction();
  }

  _resetAutoTimer() {
    this._scheduleNextAction();
  }

  //鼠标拖拽
  _bindEvents() {
    const el = this.container;

    el.addEventListener('mousedown', e => this._onPointerDown(e));
    window.addEventListener('mousemove', e => this._onPointerMove(e));
    window.addEventListener('mouseup', e => this._onPointerUp(e));

    el.addEventListener('touchstart', e => this._onPointerDown(e), { passive: false });
    window.addEventListener('touchmove', e => this._onPointerMove(e), { passive: false });
    window.addEventListener('touchend', e => this._onPointerUp(e));
  }

  _getPointerPos(e) {
    if (e.touches && e.touches.length > 0) {
      return { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }
    return { x: e.clientX, y: e.clientY };
  }

  _onPointerDown(e) {
    if (this.isDragging) return;
    e.preventDefault();

    const pos = this._getPointerPos(e);
    const rect = this.container.getBoundingClientRect();

    const relX = (pos.x - rect.left) / rect.width;
    const relY = (pos.y - rect.top) / rect.height;

    const edgeThreshold = 0.05;
    const atLeft   = relX < edgeThreshold;
    const atRight  = relX > 1 - edgeThreshold;
    const atTop  = relY < edgeThreshold;
    const atBottom = relY > 1 - edgeThreshold;
    const atEdge = atLeft || atRight || atTop || atBottom;

    //查找点击到的最顶层卡片
    let hitCard = null;
    for (let i = this.cards.length - 1; i >= 0; i--) {
      const card = this.cards[i];
      const cardRect = card.getBoundingClientRect();
      if (
        pos.x >= cardRect.left && pos.x <= cardRect.right &&
        pos.y >= cardRect.top && pos.y <= cardRect.bottom
      ) {
        //检查是否是currentTopCard优先
        if (card === this.currentTopCard) {
          hitCard = card;
          break;
        }
        if (!hitCard) hitCard = card;
      }
    }
    if (this.currentTopCard) {
      const topRect = this.currentTopCard.getBoundingClientRect();
      if (
        pos.x >= topRect.left && pos.x <= topRect.right &&
        pos.y >= topRect.top && pos.y <= topRect.bottom
      ) {
        hitCard = this.currentTopCard;
      }
    }

    if (hitCard && !atEdge) {
      //拖出模式
      this._stopAuto();
      this.isDragging = true;
      this.dragMode = 'push-out';
      this.drag.card = hitCard;
      this.drag.startX = pos.x;
      this.drag.startY = pos.y;
      this.drag.rotation = this._getCurrentRotation(hitCard);
      this.drag.baseTranslate = this._getCurrentTranslate(hitCard);

      //点击的卡片提升到最顶层
      this._bringToTop(hitCard);

    } else if (atEdge) {
      //边缘拖入
      this._stopAuto();
      this.isDragging = true;
      this.dragMode = 'pull-in';

      //根据鼠标在边缘的精确位置计算角度
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      //从边缘指向中心的角度
      const angleToCenter = Math.atan2(centerY - pos.y, centerX - pos.x);
      const edgeAngle = angleToCenter + Math.PI;

      this.drag.angle = edgeAngle;
      this.drag.startX = pos.x;
      this.drag.startY = pos.y;
      this.drag.rotation = this._randomRotation(4);

      const src = this._nextImageSrc();
      const card = this._createCard(src);
      const offscreen = this._offscreenPositionByAngle(edgeAngle);

      card.style.zIndex = this.baseZIndex + this.cards.length;
      card.style.transform = `translate(calc(-50% + ${offscreen.x}px), calc(-50% + ${offscreen.y}px)) rotate(${this.drag.rotation * 2}deg)`;
      this.stage.appendChild(card);
      card.getBoundingClientRect();

      this.drag.card = card;
      this.drag.offscreen = offscreen;
      //计算停留目标点
      this.drag.target = this._randomStopPosition();
      this.cards.push(card);
    }
  }

  _onPointerMove(e) {
    if (!this.isDragging || !this.drag.card) return;
    e.preventDefault();

    const pos = this._getPointerPos(e);
    const dx = pos.x - this.drag.startX;
    const dy = pos.y - this.drag.startY;
    const rect = this.container.getBoundingClientRect();

    if (this.dragMode === 'pull-in') {
      const off = this.drag.offscreen;
      const target = this.drag.target;

      //用鼠标移动距离与总距离的比值作为进度
      const totalDist = Math.sqrt(
        (off.x - target.x) ** 2 + (off.y - target.y) ** 2
      );

      //鼠标移动在入场方向上的投影
      const inAngle = this.drag.angle + Math.PI; //入场方向
      const projection = dx * Math.cos(inAngle) + dy * Math.sin(inAngle);
      let progress = Math.min(1, Math.max(0, projection / (totalDist * 0.4)));

      const ease = this._easeOutQuint(progress);
      const cx = off.x + (target.x - off.x) * ease;
      const cy = off.y + (target.y - off.y) * ease;
      const cr = this.drag.rotation * 2 * (1 - ease) + this.drag.rotation * ease;

      this.drag.card.style.transform = `translate(calc(-50% + ${cx}px), calc(-50% + ${cy}px)) rotate(${cr}deg)`;
      this.drag.progress = progress;

    } else if (this.dragMode === 'push-out') {
      const base = this.drag.baseTranslate;
      const addRotation = (dx / rect.width) * 8;
      const cr = this.drag.rotation + addRotation;

      this.drag.card.style.transform = `translate(calc(-50% + ${base.x + dx}px), calc(-50% + ${base.y + dy}px)) rotate(${cr}deg)`;
      this.drag.currentX = dx;
      this.drag.currentY = dy;

      //记录当前鼠标是否在边缘区域
      const relX = (pos.x - rect.left) / rect.width;
      const relY = (pos.y - rect.top) / rect.height;
      this.drag.atEdge = (relX < 0.10 || relX > 0.90 || relY < 0.10 || relY > 0.90);
    }
  }

  async _onPointerUp(e) {
    if (!this.isDragging || !this.drag.card) return;

    this.isDragging = false;
    const card = this.drag.card;

    if (this.dragMode === 'pull-in') {
      const progress = this.drag.progress || 0;

      if (progress > 0.35) {
        //完成拉入
        const current = this._getCurrentTranslate(card);
        const currentRot = this._getCurrentRotation(card);
        const target = this.drag.target;

        await this._animateCard(
          card,
          current.x, current.y, currentRot,
          target.x, target.y, this.drag.rotation,
          this.slideDuration * (1 - progress)
        );

        this._bringToTop(card);
      } else {
        //弹回
        const current = this._getCurrentTranslate(card);
        const currentRot = this._getCurrentRotation(card);
        const off = this.drag.offscreen;

        //从cards数组移除
        const idx = this.cards.indexOf(card);
        if (idx >= 0) this.cards.splice(idx, 1);

        await this._animateCard(
          card,
          current.x, current.y, currentRot,
          off.x, off.y, this.drag.rotation * 2,
          this.slideDuration * 0.6
        );

        if (card.parentNode) card.parentNode.removeChild(card);
        this.imageIndex--;
      }

    } else if (this.dragMode === 'push-out') {
      const dx = this.drag.currentX || 0;
      const dy = this.drag.currentY || 0;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const rect = this.container.getBoundingClientRect();

      //松手时鼠标位置判定
      const pos = this._getPointerPos(e);
      const relX = (pos.x - rect.left) / rect.width;
      const relY = (pos.y - rect.top) / rect.height;
      const atEdge = (relX < 0.10 || relX > 0.90 || relY < 0.10 || relY > 0.90);

      if (atEdge && dist > 30) {
        const outAngle = Math.atan2(dy, dx);
        const current = this._getCurrentTranslate(card);
        const currentRot = this._getCurrentRotation(card);
        const to = this._offscreenPositionByAngle(outAngle);

        const idx = this.cards.indexOf(card);
        if (idx >= 0) this.cards.splice(idx, 1);
        if (this.currentTopCard === card) this.currentTopCard = null;

        await this._animateCard(
          card,
          current.x, current.y, currentRot,
          to.x + current.x, to.y + current.y, currentRot + this._randomRotation(10),
          this.slideDuration
        );

        if (card.parentNode) card.parentNode.removeChild(card);

        this.cards.forEach((c, i) => {
          if (c !== this.currentTopCard) {
            c.style.zIndex = this.baseZIndex + i;
          }
        });
      }
    }

    this.drag = { startX: 0, startY: 0, currentX: 0, currentY: 0, angle: 0, card: null, rotation: 0 };
    this.dragMode = null;

    this._resetAutoTimer();
  }
}
