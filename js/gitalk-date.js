(function () {
  'use strict';

  var CONTAINER_SELECTOR = '#gitalk-container';
  var COMMENT_SELECTOR = '.gt-comment';
  var DATE_SELECTOR = '.gt-comment-date';
  var EDIT_LINK_SELECTOR = '.gt-comment-edit[href*="#issuecomment-"]';
  var API_ROOT = 'https://api.github.com/repos/vegetarianwolf/comments';
  var DATE_FORMATTER = new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'Asia/Shanghai'
  });

  var dateCache = new Map();
  var issueCommentsRequest = null;
  var updateQueued = false;

  function parseCommentInfo(commentElement) {
    var editLink = commentElement.querySelector(EDIT_LINK_SELECTOR);
    if (!editLink) {
      return null;
    }

    var match = editLink.href.match(/\/issues\/(\d+)#issuecomment-(\d+)/);
    if (!match) {
      return null;
    }

    return {
      issueNumber: match[1],
      commentId: match[2]
    };
  }

  function rememberCommentDate(comment) {
    if (comment && comment.id && comment.created_at) {
      dateCache.set(String(comment.id), comment.created_at);
    }
  }

  async function fetchJson(url) {
    var response = await fetch(url);
    if (!response.ok) {
      throw new Error('GitHub API request failed with ' + response.status);
    }
    return response.json();
  }

  async function loadIssueComments(issueNumber) {
    var comments = await fetchJson(
      API_ROOT + '/issues/' + issueNumber + '/comments?per_page=100'
    );

    if (Array.isArray(comments)) {
      comments.forEach(rememberCommentDate);
    }
  }

  async function loadComment(commentId) {
    var comment = await fetchJson(
      API_ROOT + '/issues/comments/' + commentId
    );
    rememberCommentDate(comment);
  }

  function applyDate(target) {
    var createdAt = dateCache.get(target.commentId);
    if (!createdAt) {
      return;
    }

    var date = new Date(createdAt);
    if (Number.isNaN(date.getTime())) {
      return;
    }

    target.dateElement.dataset.gitalkCreatedAt = createdAt;
    target.dateElement.textContent = DATE_FORMATTER.format(date);
  }

  async function updateCommentDates() {
    var container = document.querySelector(CONTAINER_SELECTOR);
    if (!container) {
      return;
    }

    var targets = Array.from(container.querySelectorAll(COMMENT_SELECTOR))
      .map(function (commentElement) {
        var dateElement = commentElement.querySelector(DATE_SELECTOR);
        var info = parseCommentInfo(commentElement);

        if (!dateElement || !info || dateElement.dataset.gitalkCreatedAt) {
          return null;
        }

        return {
          dateElement: dateElement,
          issueNumber: info.issueNumber,
          commentId: info.commentId
        };
      })
      .filter(Boolean);

    if (targets.length === 0) {
      return;
    }

    if (!issueCommentsRequest) {
      issueCommentsRequest = loadIssueComments(targets[0].issueNumber)
        .catch(function () {});
    }
    await issueCommentsRequest;

    var missingCommentIds = targets
      .map(function (target) { return target.commentId; })
      .filter(function (commentId) { return !dateCache.has(commentId); });

    await Promise.all(missingCommentIds.map(function (commentId) {
      return loadComment(commentId).catch(function () {});
    }));

    targets.forEach(applyDate);
  }

  function queueUpdate() {
    if (updateQueued) {
      return;
    }

    updateQueued = true;
    Promise.resolve().then(function () {
      updateQueued = false;
      updateCommentDates().catch(function () {});
    });
  }

  function start() {
    var container = document.querySelector(CONTAINER_SELECTOR);
    if (!container) {
      return;
    }

    new MutationObserver(queueUpdate).observe(container, {
      childList: true,
      subtree: true
    });
    queueUpdate();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
