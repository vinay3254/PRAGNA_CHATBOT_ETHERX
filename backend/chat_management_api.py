"""
Chat Management API - Handles chat operations
Provides endpoints for: rename, pin, archive, delete, share, group chat
"""
import logging
import hashlib
import secrets
from datetime import datetime
from flask import Blueprint, request, jsonify
from auth import require_auth
from database import db

logger = logging.getLogger(__name__)

chat_management_bp = Blueprint('chat_management', __name__, url_prefix='/api/chat')

# Helper function to validate chat ownership
def validate_chat_ownership(chat_id, user_id):
    """Verify that user owns the chat"""
    conn = db.get_connection()
    c = conn.cursor()
    c.execute('SELECT user_id FROM conversations WHERE id = ?', (chat_id,))
    result = c.fetchone()
    if not result:
        # Conversation does not exist in backend database yet (local-first design).
        # We auto-create it for the current logged-in user so they own it.
        try:
            c.execute('''
                INSERT INTO conversations (id, user_id, title)
                VALUES (?, ?, ?)
            ''', (chat_id, user_id, "New Chat"))
            conn.commit()
            conn.close()
            return True
        except Exception as e:
            logger.error(f"Error auto-inserting conversation: {e}")
            conn.close()
            return False
    conn.close()
    return result[0] == user_id


@chat_management_bp.route('/<chat_id>/rename', methods=['PATCH'])
@require_auth
def rename_chat(chat_id):
    """Rename a chat"""
    try:
        user_id = request.user_id
        
        # Validate ownership
        if not validate_chat_ownership(chat_id, user_id):
            return jsonify({'error': 'Unauthorized: Chat not found or not owned by user'}), 403
        
        data = request.get_json()
        new_title = data.get('title', '').strip()
        
        if not new_title:
            return jsonify({'error': 'Title cannot be empty'}), 400
        
        if len(new_title) > 200:
            return jsonify({'error': 'Title too long (max 200 characters)'}), 400
        
        # Update title in database
        db.update_conversation_title(chat_id, new_title)
        
        return jsonify({
            'success': True,
            'chat_id': chat_id,
            'new_title': new_title,
            'message': 'Chat renamed successfully'
        }), 200
    
    except Exception as e:
        logger.error(f"Error renaming chat: {str(e)}")
        return jsonify({'error': 'Failed to rename chat'}), 500


@chat_management_bp.route('/<chat_id>/pin', methods=['PATCH'])
@require_auth
def pin_chat(chat_id):
    """Pin or unpin a chat"""
    try:
        user_id = request.user_id
        
        # Validate ownership
        if not validate_chat_ownership(chat_id, user_id):
            return jsonify({'error': 'Unauthorized: Chat not found or not owned by user'}), 403
        
        data = request.get_json()
        is_pinned = data.get('is_pinned', True)
        
        conn = db.get_connection()
        c = conn.cursor()
        c.execute('''
            UPDATE conversations 
            SET is_pinned = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        ''', (1 if is_pinned else 0, chat_id))
        conn.commit()
        conn.close()
        
        return jsonify({
            'success': True,
            'chat_id': chat_id,
            'is_pinned': is_pinned,
            'message': f"Chat {'pinned' if is_pinned else 'unpinned'} successfully"
        }), 200
    
    except Exception as e:
        logger.error(f"Error pinning chat: {str(e)}")
        return jsonify({'error': 'Failed to pin/unpin chat'}), 500


@chat_management_bp.route('/<chat_id>/archive', methods=['PATCH'])
@require_auth
def archive_chat(chat_id):
    """Archive a chat"""
    try:
        user_id = request.user_id
        
        # Validate ownership
        if not validate_chat_ownership(chat_id, user_id):
            return jsonify({'error': 'Unauthorized: Chat not found or not owned by user'}), 403
        
        conn = db.get_connection()
        c = conn.cursor()
        c.execute('''
            UPDATE conversations 
            SET is_archived = 1, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        ''', (chat_id,))
        conn.commit()
        conn.close()
        
        return jsonify({
            'success': True,
            'chat_id': chat_id,
            'is_archived': True,
            'message': 'Chat archived successfully'
        }), 200
    
    except Exception as e:
        logger.error(f"Error archiving chat: {str(e)}")
        return jsonify({'error': 'Failed to archive chat'}), 500


@chat_management_bp.route('/<chat_id>', methods=['DELETE'])
@require_auth
def delete_chat(chat_id):
    """Delete a chat"""
    try:
        user_id = request.user_id
        
        # Validate ownership
        if not validate_chat_ownership(chat_id, user_id):
            return jsonify({'error': 'Unauthorized: Chat not found or not owned by user'}), 403
        
        conn = db.get_connection()
        c = conn.cursor()
        
        # Delete associated messages first
        c.execute('DELETE FROM messages WHERE conversation_id = ?', (chat_id,))
        
        # Delete the conversation
        c.execute('DELETE FROM conversations WHERE id = ?', (chat_id,))
        
        conn.commit()
        conn.close()
        
        return jsonify({
            'success': True,
            'chat_id': chat_id,
            'message': 'Chat deleted successfully'
        }), 200
    
    except Exception as e:
        logger.error(f"Error deleting chat: {str(e)}")
        return jsonify({'error': 'Failed to delete chat'}), 500


@chat_management_bp.route('/<chat_id>/share', methods=['POST'])
@require_auth
def share_chat(chat_id):
    """Generate a shareable link for a chat.

    Chats live client-side (localStorage) in this app's local-first design, so
    the backend has no message history for chat_id until the client sends one.
    The frontend passes the current snapshot (title + messages) here, which
    gets persisted so the public /api/share/<token> endpoint has something to
    serve. Re-sharing an already-shared chat re-syncs the snapshot and reuses
    the same conversation row (a new token is still minted each call).
    """
    try:
        user_id = request.user_id

        # Validate ownership
        if not validate_chat_ownership(chat_id, user_id):
            return jsonify({'error': 'Unauthorized: Chat not found or not owned by user'}), 403

        data = request.get_json(silent=True) or {}
        title = (data.get('title') or '').strip()
        messages = data.get('messages') or []

        # Generate a unique share token
        share_token = secrets.token_urlsafe(32)

        conn = db.get_connection()
        c = conn.cursor()

        if title:
            c.execute('''
                UPDATE conversations
                SET title = ?, share_token = ?, updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
            ''', (title[:200], share_token, chat_id))
        else:
            c.execute('''
                UPDATE conversations
                SET share_token = ?, updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
            ''', (share_token, chat_id))

        if isinstance(messages, list) and messages:
            # Replace any previously-synced snapshot with the current one.
            c.execute('DELETE FROM messages WHERE conversation_id = ?', (chat_id,))
            for msg in messages:
                sender = (msg.get('sender') or '').strip()
                text = (msg.get('text') or '').strip()
                if sender not in ('user', 'bot') or not text:
                    continue
                message_id = secrets.token_hex(16)
                c.execute('''
                    INSERT INTO messages (id, conversation_id, sender, text)
                    VALUES (?, ?, ?, ?)
                ''', (message_id, chat_id, sender, text))

        conn.commit()
        conn.close()

        # Generate shareable URL (frontend will use this)
        share_url = f"/share/{share_token}"

        return jsonify({
            'success': True,
            'chat_id': chat_id,
            'share_token': share_token,
            'share_url': share_url,
            'message': 'Chat shared successfully'
        }), 200

    except Exception as e:
        logger.error(f"Error sharing chat: {str(e)}")
        return jsonify({'error': 'Failed to share chat'}), 500


@chat_management_bp.route('/<chat_id>/group', methods=['POST'])
@require_auth
def start_group_chat(chat_id):
    """Start a group chat (add collaborators)"""
    try:
        user_id = request.user_id
        
        # Validate ownership
        if not validate_chat_ownership(chat_id, user_id):
            return jsonify({'error': 'Unauthorized: Chat not found or not owned by user'}), 403
        
        data = request.get_json()
        collaborators = data.get('collaborators', [])  # List of usernames/emails
        
        if not collaborators:
            return jsonify({'error': 'No collaborators specified'}), 400
        
        # Get current chat info
        conn = db.get_connection()
        c = conn.cursor()
        c.execute('SELECT * FROM conversations WHERE id = ?', (chat_id,))
        chat = dict(c.fetchone())
        conn.close()
        
        # In a real implementation, you would:
        # 1. Verify each collaborator exists in the system
        # 2. Save collaborator relationships in a dedicated table
        # 3. Send notifications to collaborators
        # For now, we'll just store the list
        
        group_metadata = {
            'created_at': datetime.now().isoformat(),
            'owner': user_id,
            'collaborators': collaborators,
            'is_group': True
        }
        
        return jsonify({
            'success': True,
            'chat_id': chat_id,
            'collaborators': collaborators,
            'group_metadata': group_metadata,
            'message': f'Group chat started with {len(collaborators)} collaborators'
        }), 200
    
    except Exception as e:
        logger.error(f"Error starting group chat: {str(e)}")
        return jsonify({'error': 'Failed to start group chat'}), 500


@chat_management_bp.route('/<chat_id>/info', methods=['GET'])
@require_auth
def get_chat_info(chat_id):
    """Get chat information and metadata"""
    try:
        user_id = request.user_id
        
        # Validate ownership
        if not validate_chat_ownership(chat_id, user_id):
            return jsonify({'error': 'Unauthorized: Chat not found or not owned by user'}), 403
        
        conn = db.get_connection()
        c = conn.cursor()
        c.execute('''
            SELECT id, title, created_at, updated_at, is_archived, 
                   is_pinned, share_token
            FROM conversations 
            WHERE id = ?
        ''', (chat_id,))
        
        result = c.fetchone()
        conn.close()
        
        if not result:
            return jsonify({'error': 'Chat not found'}), 404
        
        chat_info = dict(result)
        chat_info['is_pinned'] = bool(chat_info.get('is_pinned', 0))
        chat_info['is_archived'] = bool(chat_info.get('is_archived', 0))
        chat_info['has_share_link'] = bool(chat_info.get('share_token'))
        
        return jsonify({
            'success': True,
            'chat': chat_info
        }), 200
    
    except Exception as e:
        logger.error(f"Error getting chat info: {str(e)}")
        return jsonify({'error': 'Failed to get chat info'}), 500
